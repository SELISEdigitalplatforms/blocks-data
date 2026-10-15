using System.Diagnostics;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.Api.Controllers;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using Moq;
using Storage.DomainService.Entities;
using Worker.Jobs;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;

namespace XUnitTest.DataGateway.DataSources;

/// <summary>
/// Error text (C52, R-SEC-ERROR, DATA-13), startup wiring (R-STARTUP, S9) and the audit entity (R-FILES, H10).
/// </summary>
[Collection("ContextSerial")]
public class DataSourceErrorAndStartupTests
{
    private const string Password = "Pw-9f8e7d-Secret";
    private static readonly string BadConnectionString = $"mongodb://admin:{Password}@byo-host:notaport/?authSource=admin";

    private sealed class ValueResolver(string value) : IDataSourceSecretResolver
    {
        public Task<string?> ResolveAsync(string tenantId, string? secretId, CancellationToken cancellationToken = default) => Task.FromResult<string?>(value);
        public Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation, string? serviceUserId = null) => throw new NotSupportedException();
    }

    private static async Task<DataSourceUnavailableException> BuildFailureAsync()
    {
        using var cache = new DataSourceClientCache(new ValueResolver(BadConnectionString),
            new DataSourceClientFactory(new ActivitySource("err")), new DriverClusterRegistry(),
            NullLogger<DataSourceClientCache>.Instance, startSweeper: false);
        try
        {
            await cache.GetAsync("t", "0123456789abcdef0123456789abcdef", "v1", "db", CancellationToken.None);
        }
        catch (DataSourceUnavailableException ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected a failure");
    }

    [Fact]
    public void TheRealDriverParseMessage_ShowsTheHost_AndTheWholeValueWhenItIsNotAUri_WhyTheFixedTextIsKept()
    {
        // Driver 3.8.0 masks a user:password part ("<hidden>") but keeps host and options; a value without that part
        // (e.g. a pasted secret that is not a URI) is shown whole.
        var uri = () => MongoDB.Driver.MongoClientSettings.FromConnectionString(BadConnectionString);
        uri.Should().Throw<Exception>().Which.Message.Should().Contain("byo-host");
        var notUri = () => MongoDB.Driver.MongoClientSettings.FromConnectionString(Password + " pasted by mistake");
        notUri.Should().Throw<Exception>().Which.Message.Should().Contain(Password);
    }

    [Theory]
    [InlineData("not-a-uri")]
    [InlineData("uri")]
    public async Task ClientBuildFailure_AnyParseError_FixedMessage(string kind)
    {
        var value = kind == "uri" ? BadConnectionString : Password + " pasted by mistake";
        using var cache = new DataSourceClientCache(new ValueResolver(value),
            new DataSourceClientFactory(new ActivitySource("err")), new DriverClusterRegistry(),
            NullLogger<DataSourceClientCache>.Instance, startSweeper: false);

        var act = () => cache.GetAsync("t", "0123456789abcdef0123456789abcdef", "v1", "db", CancellationToken.None);

        var ex = (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which;
        ex.Message.Should().Be("The data source of this project is not available.");
        ex.ToString().Should().NotContain(Password).And.NotContain("byo-host");
    }

    [Fact]
    public async Task ClientBuildFailure_FixedMessage_NoPasswordNoConnectionString()
    {
        var ex = await BuildFailureAsync();
        ex.Message.Should().Be("The data source of this project is not available.");
        ex.ToString().Should().NotContain(Password).And.NotContain("byo-host");
    }

    [Fact]
    public async Task GatewayTraceTag_NeverHoldsThePassword()
    {
        var failure = await BuildFailureAsync();
        using var activity = new Activity("request").Start();
        var op = GatewayOperationActivity.MarkFailed(activity, GatewayFailureKind.Unhandled, failure.Message);
        GatewayOperationActivity.Tag(activity, op);
        string.Join("|", activity.TagObjects.Select(t => t.Value?.ToString())).Should().NotContain(Password);
    }

    [Fact]
    public async Task ResolverFailure_KeepsTheInnerMessage_AsToday()
    {
        var secrets = new FakeSecretService { FailWith = new SecretStateException(SecretStatuses.Deleted, "GetValue") };
        BlocksContext.SetContext(null);
        var act = () => secrets.Resolver().ResolveAsync("t", "0123456789abcdef0123456789abcdef");
        (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which.Message
            .Should().Be("Cannot perform 'GetValue' on a secret with status 'deleted'.");
    }

    // ---------------- startup ----------------

    private static ServiceProvider BuildHost(Action<IServiceCollection>? extra = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Mock.Of<IDbContextProvider>());
        services.AddSingleton(Mock.Of<ICacheClient>());
        services.AddSingleton(Mock.Of<IBlocksSecret>());
        services.AddSingleton(Mock.Of<ITenants>());
        services.AddSingleton(new ActivitySource("startup-test"));
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddKeyValueStore(); // Genesis ApplicationConfigurations.ConfigureServices registers it in both hosts
        services.RegisterSchemaServices();
        extra?.Invoke(services);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
    }

    [Fact]
    public void ApiAndWorkerWiring_SecretsScoped_ResolverAndCacheSingletons()
    {
        using var api = BuildHost();
        using (var scope = api.CreateScope())
            scope.ServiceProvider.GetRequiredService<ISecretService>().Should().NotBeNull();
        FluentActions.Invoking(() => api.GetRequiredService<ISecretService>()).Should().Throw<InvalidOperationException>("ISecretService is scoped");
        api.GetRequiredService<IDataSourceClientCache>().Should().BeSameAs(api.GetRequiredService<IDataSourceClientCache>());
        api.GetRequiredService<IDataSourceClientCache>().Should().BeSameAs(api.GetRequiredService<DataSourceClientCache>());
        api.GetRequiredService<IDataSourceSecretResolver>().Should().BeSameAs(api.GetRequiredService<IDataSourceSecretResolver>());
        api.GetRequiredService<IGqlDbRepository>().Should().NotBeNull();

        using var worker = BuildHost(s =>
        {
            s.AddSingleton<IDscMigrationDatabases, DscMigrationDatabases>();
            s.AddSingleton<IDscMigrationRedis, DscMigrationRedis>();
            s.AddSingleton<DataSourceSecretMigrationJob>();
        });
        worker.GetRequiredService<DataSourceSecretMigrationJob>().Should().NotBeNull();
    }

    [Fact]
    public void NoNewStartLogLine()
    {
        var logs = new RecordingLoggerProvider();
        using var api = BuildHost(s => s.AddLogging(b => b.AddProvider(logs)));
        _ = api.GetRequiredService<IDataSourceClientCache>();
        _ = api.GetRequiredService<IDataSourceSecretResolver>();
        logs.Logs.Should().NotContain(l => l.Message.Contains("value-store"));
    }

    // ---------------- audit entity (Storage) ----------------

    [Fact]
    public void AuditEntity_ReadsOldFileRows_AndNewDataGatewayRows()
    {
        var oldRow = new BsonDocument
        {
            { "_id", "f-1" }, { "TenantId", "t" }, { "ResourceId", "file-1" }, { "ResourceType", "File" },
            { "UserId", "u" }, { "Action", "Download" }, { "Granted", true }, { "Detail", "v2" }
        };
        var old = BsonSerializer.Deserialize<ObjectAuditLog>(oldRow);
        old.ResourceType.Should().Be(ObjectResourceType.File);
        old.Record.Should().BeNull();

        var newRow = AuditLogDocument.Build("data-delete", "DataRecord", "rec-1", "u", "t",
            new Dictionary<string, string> { ["CollectionName"] = "Persons" }, new BsonDocument("Name", "Ada"));
        newRow["MigratedFrom"] = "DataMutationRecords";
        var parsed = BsonSerializer.Deserialize<ObjectAuditLog>(newRow);
        parsed.ResourceType.Should().Be(ObjectResourceType.DataRecord);
        parsed.Record!["Name"].AsString.Should().Be("Ada");
        parsed.Granted.Should().BeTrue();

        var export = BsonSerializer.Deserialize<ObjectAuditLog>(AuditLogDocument.Build("schema-export", "SchemaExport", "f", "u", "t", new Dictionary<string, string>()));
        export.ResourceType.Should().Be(ObjectResourceType.SchemaExport);
    }

    [Fact]
    public void AuditEntity_NullRecordIsNotStored()
    {
        new ObjectAuditLog { ResourceType = ObjectResourceType.File }.ToBsonDocument().Contains("Record").Should().BeFalse();
        ((int)ObjectResourceType.SchemaExport).Should().Be(3);
        ((int)ObjectResourceType.DataRecord).Should().Be(4);
    }
}
