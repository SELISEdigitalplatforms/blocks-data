using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using HotChocolate.Execution;
using HotChocolate.Execution.Configuration;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// End-to-end proof, against HotChocolate's real executor resolver and a real MongoDB, that a
/// schema reload reaches every pod: each "pod" is its own service provider, and the pods share only
/// the tenant database, as gateway replicas do in production.
/// </summary>
[Collection("Mongo")]
public class MultiPodSchemaReloadTests
{
    private const string Tenant = "tenant_1"; // schema names must be valid GraphQL names
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    // Replicas share one Redis as well as the database.
    private readonly InMemoryCacheClient _cache = new();

    public MultiPodSchemaReloadTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        _repository = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private sealed class Pod : IAsyncDisposable
    {
        public required ServiceProvider Services { get; init; }
        public IRequestExecutorResolver Resolver => Services.GetRequiredService<IRequestExecutorResolver>();
        public SchemaVersionTracker Tracker => Services.GetRequiredService<SchemaVersionTracker>();
        public SchemaConfigurationService Configuration => Services.GetRequiredService<SchemaConfigurationService>();
        public BuiltSchemaVersions BuiltVersions => Services.GetRequiredService<BuiltSchemaVersions>();
        public SchemaPublishSubscriber Subscriber => Services.GetRequiredService<SchemaPublishSubscriber>();

        public ValueTask DisposeAsync() => Services.DisposeAsync();
    }

    /// <summary>The same wiring as <c>ServiceRegistry</c>, minus HTTP and the data services.</summary>
    private Pod StartPod()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddGraphQLServer().ModifyRequestOptions(o => o.IncludeExceptionDetails = true); // readable failures
        services.RemoveAll<IRequestExecutorOptionsMonitor>();
        services.AddSingleton<DataGatewayPipelineDispatcher>();

        services.AddSingleton<IDbRepository>(_repository);
        services.AddSingleton<ICacheClient>(_cache);
        services.AddSingleton(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object));
        services.AddSingleton<GraphqlSchemaBuilder>();
        services.AddSingleton<ISchemaVersionStore, SchemaVersionStore>();
        services.AddSingleton<BuiltSchemaVersions>();
        services.AddSingleton<ITenantSchemaConfigurator, TenantSchemaConfigurator>();
        services.AddSingleton<ProjectExecutorOptionsMonitor>();
        services.AddSingleton<IRequestExecutorOptionsMonitor>(sp => sp.GetRequiredService<ProjectExecutorOptionsMonitor>());
        services.AddSingleton(sp => new SchemaVersionTracker(
            sp.GetRequiredService<ISchemaVersionStore>(),
            sp.GetRequiredService<BuiltSchemaVersions>(),
            () => sp.GetRequiredService<IRequestExecutorResolver>(),
            TimeProvider.System,
            SchemaVersionTracker.DefaultPollInterval,
            NullLogger<SchemaVersionTracker>.Instance));
        services.AddSingleton<SchemaConfigurationService>();
        services.AddSingleton(sp => new SchemaPublishSubscriber(
            _cache, sp.GetRequiredService<SchemaVersionTracker>(), NullLogger<SchemaPublishSubscriber>.Instance));

        return new Pod { Services = services.BuildServiceProvider() };
    }

    private readonly string _personId = Guid.NewGuid().ToString();

    private Task SeedPersonAsync(params string[] fields) =>
        _repository.UpsertAsync(new SchemaDefinition
        {
            ItemId = _personId,
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = fields.Select(name => new FieldDefinition { Name = name, Type = "String" }).ToList()
        });

    private static bool HasPersonField(IRequestExecutor executor, string field) =>
        executor.Schema.GetType<ObjectType>("Person").Fields.Any(f => f.Name == field);

    private static async Task<IRequestExecutor> WaitForRebuildAsync(Pod pod, IRequestExecutor previous)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            var current = await pod.Resolver.GetRequestExecutorAsync(Tenant);
            if (!ReferenceEquals(current, previous))
            {
                return current;
            }
            await Task.Delay(50);
        }
        throw new TimeoutException("HotChocolate did not rebuild the evicted executor");
    }

    /// <summary>Sends a GraphQL request through the tenant's real HTTP pipeline, as the gateway endpoint does.</summary>
    private static async Task<string> PostAsync(Pod pod, string query)
    {
        // Each request gets its own service scope, as ASP.NET Core gives it.
        await using var scope = pod.Services.CreateAsyncScope();
        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/";
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { query })));
        context.Response.Body = new MemoryStream();

        var pipeline = pod.Services.GetRequiredService<DataGatewayPipelineDispatcher>().GetPipeline(Tenant);
        await pipeline(context);

        context.Response.Body.Position = 0;
        return await new StreamReader(context.Response.Body).ReadToEndAsync();
    }

    private const string PersonFieldsQuery = "{ __type(name: \"Person\") { fields { name } } }";

    private Task SeedChangeLogAsync(string id) =>
        _repository.InsertAsync(new SchemaChangeLog { ItemId = id, SchemaId = _personId, ChangeType = SchemaChangeType.SchemaFieldUpdate });

    [Fact]
    public async Task ARequestRightAfterAPublishGetsTheNewSchema()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        (await PostAsync(pod, PersonFieldsQuery)).Should().Contain("\"Name\"").And.NotContain("\"Age\"");

        await SeedPersonAsync("Name", "Age");
        await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // This is what the Publish button does next: it re-reads the schema through the gateway.
        (await PostAsync(pod, PersonFieldsQuery)).Should().Contain("\"Age\"");
    }

    [Fact]
    public async Task ASchemaThatDoesNotBuildIsNotPublished()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);
        await SeedChangeLogAsync("pending-1");

        // A type name with a space is not a valid GraphQL name, so the schema cannot be created.
        await _repository.InsertAsync(new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Bad Name",
            CollectionName = "BadNames",
            SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Title", Type = "String" }]
        });

        var publish = () => pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        await publish.Should().ThrowAsync<SchemaPublishException>();
        (await pod.Services.GetRequiredService<ISchemaVersionStore>().GetAsync(Tenant)).Should().Be(0, "no pod is told about a schema that does not build");
        var log = await _db.GetCollection<SchemaChangeLog>("SchemaChangeLogs").Find(l => l.ItemId == "pending-1").SingleAsync();
        log.DoesServerAdaptChanges.Should().BeFalse("the change was not published");
        (await pod.Resolver.GetRequestExecutorAsync(Tenant)).Should().BeSameAs(before);
    }

    [Fact]
    public async Task AnEvictedExecutorIsRebuiltInTheBackgroundWithoutARequestContext()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);
        HasPersonField(before, "Age").Should().BeFalse();

        await SeedPersonAsync("Name", "Age");
        pod.Resolver.EvictRequestExecutor(Tenant);
        var after = await WaitForRebuildAsync(pod, before);

        HasPersonField(after, "Age").Should().BeTrue();

        // A request that started on the old executor still completes on it.
        var result = await before.ExecuteAsync("{ __typename }");
        result.ExpectOperationResult().Errors.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task AReloadOnOnePodReachesAnotherPodThroughTheRedisMessage()
    {
        await SeedPersonAsync("Name");
        await using var podA = StartPod();
        await using var podB = StartPod();
        await podB.Subscriber.StartAsync(CancellationToken.None);
        var beforeB = await podB.Resolver.GetRequestExecutorAsync(Tenant);
        _ = await podA.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // Pod B gets no request and runs no check: the announcement alone brings it up to date.
        HasPersonField(await WaitForRebuildAsync(podB, beforeB), "Age").Should().BeTrue();
        await podB.Subscriber.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task AReloadOnOnePodReachesAnotherPodOnItsNextCheck()
    {
        await SeedPersonAsync("Name");
        await using var podA = StartPod();
        await using var podB = StartPod();
        var beforeA = await podA.Resolver.GetRequestExecutorAsync(Tenant);
        var beforeB = await podB.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // Pod A handled the reload and rebuilds straight away.
        HasPersonField(await WaitForRebuildAsync(podA, beforeA), "Age").Should().BeTrue();

        // Pod B is not subscribed (as if the message were lost); its next request finds it is behind.
        await podB.Tracker.EnsureCurrentAsync(Tenant);
        var afterB = await WaitForRebuildAsync(podB, beforeB);

        HasPersonField(afterB, "Age").Should().BeTrue();
        podB.BuiltVersions.TryGetBuilt(Tenant, out var builtB).Should().BeTrue();
        builtB.Should().Be(1);
    }

    [Fact]
    public async Task APodThatIsUpToDateKeepsItsExecutor()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);

        await pod.Tracker.EnsureCurrentAsync(Tenant);
        await Task.Delay(200);

        (await pod.Resolver.GetRequestExecutorAsync(Tenant)).Should().BeSameAs(before);
    }
}
