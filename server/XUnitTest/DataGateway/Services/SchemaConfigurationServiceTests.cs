using System.Net;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.AspNetCore;
using HotChocolate.AspNetCore.Serialization;
using HotChocolate.Execution;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Covers schema reload/removal, which raises the tenant's published version that every pod checks
/// and rebuilds this pod's executor, plus the response formatter that turns GraphQL auth errors
/// into HTTP status codes.
/// </summary>
[Collection("Mongo")]
public class SchemaConfigurationServiceTests
{
    private readonly IMongoDatabase _db;

    public SchemaConfigurationServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        BlocksTestContext.Set();
    }

    private DbRepository Repository()
    {
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        return new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private GraphqlSchemaBuilder Builder()
    {
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        return new GraphqlSchemaBuilder(resolver, Repository(), NullLogger<GraphqlSchemaBuilder>.Instance);
    }

    /// <summary>One entity is enough for the builder to emit a query type.</summary>
    private Task SeedAsync() => Repository().InsertManyAsync(new List<SchemaDefinition>
    {
        new()
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Name", Type = "String" }]
        }
    });

    private sealed record Harness(
        SchemaConfigurationService Service,
        SchemaVersionStore VersionStore,
        BuiltSchemaVersions BuiltVersions,
        Mock<IRequestExecutorResolver> Resolver);

    private Harness Build()
    {
        var repository = Repository();
        var versionStore = new SchemaVersionStore(repository);
        var builtVersions = new BuiltSchemaVersions();
        var resolver = new Mock<IRequestExecutorResolver>();
        var tracker = new SchemaVersionTracker(
            versionStore, builtVersions, () => resolver.Object, TimeProvider.System,
            SchemaVersionTracker.DefaultPollInterval, NullLogger<SchemaVersionTracker>.Instance);

        var service = new SchemaConfigurationService(
            Builder(),
            repository,
            versionStore,
            tracker,
            resolver.Object,
            NullLogger<SchemaConfigurationService>.Instance);

        return new Harness(service, versionStore, builtVersions, resolver);
    }

    private static void MarkBuilt(BuiltSchemaVersions builtVersions, string tenantId, long version)
    {
        builtVersions.BeginBuild(tenantId, version);
        builtVersions.CompleteBuild(tenantId);
    }

    private Task SeedChangeLogAsync(string id, bool adapted) =>
        Repository().InsertAsync(new SchemaChangeLog
        {
            ItemId = id,
            SchemaId = "schema-1",
            ChangeType = SchemaChangeType.SchemaFieldUpdate,
            DoesServerAdaptChanges = adapted
        });

    // ---------------- reload ----------------

    [Fact]
    public async Task ReloadAsync_RaisesThePublishedVersionEveryTime()
    {
        var harness = Build();

        await harness.Service.ReloadAsync("tenant-1", CancellationToken.None);
        await harness.Service.ReloadAsync("tenant-1", CancellationToken.None);

        // Every pod compares its built version against this number.
        (await harness.VersionStore.GetAsync("tenant-1")).Should().Be(2);
    }

    [Fact]
    public async Task ReloadAsync_MarksThePendingChangeLogsAsPublished()
    {
        await SeedChangeLogAsync("pending-1", adapted: false);
        await SeedChangeLogAsync("pending-2", adapted: false);
        await SeedChangeLogAsync("already-published", adapted: true);
        var harness = Build();

        await harness.Service.ReloadAsync("tenant-1", CancellationToken.None);

        var logs = await _db.GetCollection<SchemaChangeLog>("SchemaChangeLogs").Find(FilterDefinition<SchemaChangeLog>.Empty).ToListAsync();
        logs.Should().HaveCount(3).And.OnlyContain(log => log.DoesServerAdaptChanges);
    }

    [Fact]
    public async Task ReloadAsync_RebuildsThisPodsExecutorStraightAway()
    {
        var harness = Build();
        MarkBuilt(harness.BuiltVersions, "tenant-1", 0);
        // Stand in for HotChocolate rebuilding the evicted executor at the new version.
        harness.Resolver.Setup(r => r.EvictRequestExecutor("tenant-1"))
            .Callback(() => MarkBuilt(harness.BuiltVersions, "tenant-1", 1));

        await harness.Service.ReloadAsync("tenant-1", CancellationToken.None);

        harness.Resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
        harness.BuiltVersions.TryGetBuilt("tenant-1", out var built).Should().BeTrue();
        built.Should().Be(1, "the reload returns once this pod serves the new version");
    }

    [Fact]
    public async Task ReloadAsync_LeavesATenantThisPodHasNotBuiltToBeBuiltOnDemand()
    {
        var harness = Build();

        await harness.Service.ReloadAsync("tenant-1", CancellationToken.None);

        harness.Resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task ReloadAsync_ForABlankTenantOnlyEvictsTheDefaultSchema(string? tenantId)
    {
        var harness = Build();

        await harness.Service.ReloadAsync(tenantId!, CancellationToken.None);

        harness.Resolver.Verify(r => r.EvictRequestExecutor(Schema.DefaultName), Times.Once);
        (await _db.GetCollection<SchemaPublishState>("SchemaPublishStates").CountDocumentsAsync(FilterDefinition<SchemaPublishState>.Empty))
            .Should().Be(0, "a blank tenant has no version to raise");
    }

    [Fact]
    public async Task RemoveSchemaAsync_EvictsTheTenantsExecutor()
    {
        var harness = Build();

        await harness.Service.RemoveSchemaAsync("tenant-2", CancellationToken.None);

        harness.Resolver.Verify(r => r.EvictRequestExecutor("tenant-2"), Times.Once);
    }

    // ---------------- schema building ----------------

    [Fact]
    public async Task BuildSchemaAsync_ReturnsASchemaCarryingTheStoredEntities()
    {
        await SeedAsync();
        var service = Build().Service;

        var schema = await service.BuildSchemaAsync("tenant-1", CancellationToken.None);

        schema.Should().NotBeNull();
        schema.QueryType.Should().NotBeNull();
        schema.Types.Should().Contain(type => type.Name == "Person");
    }

    [Fact]
    public async Task ConfigureSchemaAsync_AppliesTheProjectSchemaOntoAnExistingBuilder()
    {
        await SeedAsync();
        var service = Build().Service;
        var builder = SchemaBuilder.New();

        await service.ConfigureSchemaAsync("tenant-1", builder, CancellationToken.None);

        var schema = builder.Create();
        schema.QueryType.Should().NotBeNull();
        schema.Types.Should().Contain(type => type.Name == "Person");
    }

    // ---------------- constructor guards ----------------

    [Fact]
    public void Constructor_RejectsEveryNullDependency()
    {
        var builder = Builder();
        var repository = Repository();
        var versionStore = new SchemaVersionStore(repository);
        var resolver = new Mock<IRequestExecutorResolver>().Object;
        var tracker = new SchemaVersionTracker(
            versionStore, new BuiltSchemaVersions(), () => resolver, TimeProvider.System,
            SchemaVersionTracker.DefaultPollInterval, NullLogger<SchemaVersionTracker>.Instance);
        var logger = NullLogger<SchemaConfigurationService>.Instance;

        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(null!, repository, versionStore, tracker, resolver, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, null!, versionStore, tracker, resolver, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, repository, null!, tracker, resolver, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, repository, versionStore, null!, resolver, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, repository, versionStore, tracker, null!, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, repository, versionStore, tracker, resolver, null!));
    }

    // ---------------- AuthHttpResponseFormatter ----------------

    private sealed class FormatterProbe : AuthHttpResponseFormatter
    {
        public HttpStatusCode Determine(IOperationResult result, HttpStatusCode? proposed)
            => OnDetermineStatusCode(result, FormatInfo, proposed);

        private static FormatInfo FormatInfo => new(
            "application/graphql-response+json",
            ResponseContentType.GraphQLResponse,
            new Mock<IExecutionResultFormatter>().Object);
    }

    private static IOperationResult ResultWithErrorCodes(params string?[] codes)
    {
        var errors = codes
            .Select(code =>
            {
                var error = new Mock<IError>();
                error.SetupGet(e => e.Code).Returns(code);
                return error.Object;
            })
            .ToList();

        var result = new Mock<IOperationResult>();
        result.SetupGet(r => r.Errors).Returns(errors);
        result.SetupGet(r => r.ContextData).Returns(new Dictionary<string, object?>());
        return result.Object;
    }

    private static IOperationResult ResultWithError(string? code, string message)
    {
        var error = new Mock<IError>();
        error.SetupGet(e => e.Code).Returns(code);
        error.SetupGet(e => e.Message).Returns(message);

        var result = new Mock<IOperationResult>();
        result.SetupGet(r => r.Errors).Returns([error.Object]);
        result.SetupGet(r => r.ContextData).Returns(new Dictionary<string, object?>());
        return result.Object;
    }

    [Fact]
    public void Formatter_Returns401ForTheUnauthenticatedErrorCode()
    {
        var status = new FormatterProbe().Determine(
            ResultWithErrorCodes(GraphQlConstant.UnauthorizedErrorCode), HttpStatusCode.OK);

        status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("FORBIDDEN")]
    [InlineData("AUTH_NOT_AUTHORIZED")]
    public void Formatter_Returns403ForTheForbiddenErrorCodes(string code)
    {
        new FormatterProbe().Determine(ResultWithErrorCodes(code), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public void Formatter_TakesTheFirstAuthCodeItFindsInOrder()
    {
        // Authentication wins over authorization when both are reported, because the loop returns
        // on the first match rather than ranking the codes.
        new FormatterProbe()
            .Determine(ResultWithErrorCodes(GraphQlConstant.UnauthorizedErrorCode, "FORBIDDEN"), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public void Formatter_FallsBackToTheProposedCodeForANonAuthError()
    {
        new FormatterProbe().Determine(ResultWithErrorCodes("SOMETHING_ELSE"), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("HC0011")]
    [InlineData("HC0017")]
    public void Formatter_Returns400ForHotChocolateDocumentErrors(string code)
    {
        new FormatterProbe().Determine(ResultWithErrorCodes(code), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void Formatter_Returns400ForAnInputCoercionErrorWithoutAHotChocolateCode()
    {
        var result = ResultWithError(
            null,
            "The syntax node `EnumValue` is incompatible with the type `DynamicSortInput`.");

        new FormatterProbe().Determine(result, HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void Formatter_FallsBackToTheProposedCodeWhenThereAreNoErrors()
    {
        new FormatterProbe().Determine(ResultWithErrorCodes(), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.OK);
    }
}
