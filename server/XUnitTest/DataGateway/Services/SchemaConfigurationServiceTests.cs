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
/// Covers schema reload/removal, which is the seam between the version-stamped pipeline cache and
/// HotChocolate's executor eviction, plus the response formatter that turns GraphQL auth errors
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

    private static ProjectExecutorOptionsMonitor Monitor()
    {
        var options = new Mock<IOptionsMonitor<RequestExecutorSetup>>();
        options.Setup(o => o.Get(It.IsAny<string>())).Returns(new RequestExecutorSetup());
        return new ProjectExecutorOptionsMonitor(options.Object, []);
    }

    private (SchemaConfigurationService Service, DataGatewayPipelineDispatcher Dispatcher, List<string> Evictions) Build()
    {
        var dispatcher = new DataGatewayPipelineDispatcher(new ServiceCollection().BuildServiceProvider());
        var monitor = Monitor();
        var evictions = new List<string>();
        monitor.OnChange(evictions.Add);

        var service = new SchemaConfigurationService(
            Builder(),
            new Mock<IRequestExecutorResolver>().Object,
            dispatcher,
            monitor,
            NullLogger<SchemaConfigurationService>.Instance);

        return (service, dispatcher, evictions);
    }

    // ---------------- reload ----------------

    [Fact]
    public async Task ReloadAsync_EvictsTheRetiredSchemaNameAndBumpsTheVersion()
    {
        var (service, dispatcher, evictions) = Build();

        await service.ReloadAsync("tenant-1", CancellationToken.None);

        evictions.Should().Equal("tenant-1");
        // The next retired name proves the version counter moved on.
        dispatcher.BumpVersionAndClearPipeline("tenant-1").Should().Be("tenant-1__v1");
    }

    [Fact]
    public async Task ReloadAsync_EvictsSuccessiveVersionsOnRepeatedReloads()
    {
        var (service, _, evictions) = Build();

        await service.ReloadAsync("tenant-1", CancellationToken.None);
        await service.ReloadAsync("tenant-1", CancellationToken.None);
        await service.ReloadAsync("tenant-1", CancellationToken.None);

        evictions.Should().Equal("tenant-1", "tenant-1__v1", "tenant-1__v2");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task ReloadAsync_FallsBackToTheDefaultSchemaNameForABlankTenant(string? tenantId)
    {
        var (service, _, evictions) = Build();

        await service.ReloadAsync(tenantId!, CancellationToken.None);

        evictions.Should().Equal(Schema.DefaultName);
    }

    [Fact]
    public async Task RemoveSchemaAsync_EvictsTheRetiredSchemaNameWithoutTheBlankFallback()
    {
        var (service, _, evictions) = Build();

        await service.RemoveSchemaAsync("tenant-2", CancellationToken.None);

        evictions.Should().Equal("tenant-2");
    }

    [Fact]
    public async Task ReloadAsync_VersionsEachTenantIndependently()
    {
        var (service, _, evictions) = Build();

        await service.ReloadAsync("tenant-a", CancellationToken.None);
        await service.ReloadAsync("tenant-b", CancellationToken.None);
        await service.ReloadAsync("tenant-a", CancellationToken.None);

        evictions.Should().Equal("tenant-a", "tenant-b", "tenant-a__v1");
    }

    // ---------------- schema building ----------------

    [Fact]
    public async Task BuildSchemaAsync_ReturnsASchemaCarryingTheStoredEntities()
    {
        await SeedAsync();
        var (service, _, _) = Build();

        var schema = await service.BuildSchemaAsync("tenant-1", CancellationToken.None);

        schema.Should().NotBeNull();
        schema.QueryType.Should().NotBeNull();
        schema.Types.Should().Contain(type => type.Name == "Person");
    }

    [Fact]
    public async Task ConfigureSchemaAsync_AppliesTheProjectSchemaOntoAnExistingBuilder()
    {
        await SeedAsync();
        var (service, _, _) = Build();
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
        var resolver = new Mock<IRequestExecutorResolver>().Object;
        var dispatcher = new DataGatewayPipelineDispatcher(new ServiceCollection().BuildServiceProvider());
        var monitor = Monitor();
        var logger = NullLogger<SchemaConfigurationService>.Instance;

        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(null!, resolver, dispatcher, monitor, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, null!, dispatcher, monitor, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, resolver, null!, monitor, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, resolver, dispatcher, null!, logger));
        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationService(builder, resolver, dispatcher, monitor, null!));
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

    [Fact]
    public void Formatter_FallsBackToTheProposedCodeWhenThereAreNoErrors()
    {
        new FormatterProbe().Determine(ResultWithErrorCodes(), HttpStatusCode.OK)
            .Should().Be(HttpStatusCode.OK);
    }
}
