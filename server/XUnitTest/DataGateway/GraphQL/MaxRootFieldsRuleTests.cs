using DataGateway.DomainService.Helpers;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using XUnitTest.Infrastructure;
using Blocks.Genesis.DataAccess.Rules;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// Every root field runs its own database calls, and a request may repeat a root field under
/// aliases, so one request could fan out into hundreds of database calls. The cap on root fields
/// per operation rejects such a request during validation, before a single resolver runs.
/// </summary>
[Collection("Mongo")]
public class MaxRootFieldsRuleTests
{
    private const int Cap = GraphQlConstant.MaxRootFieldsPerOperation;

    private readonly DbRepository _repo;
    private int _queryCalls;
    private int _mutationCalls;

    public MaxRootFieldsRuleTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        // The schema-access middleware wants a valid tenant: a Blocks Cloud request with the header present.
        // (Set here, not in BuildExecutorAsync: an AsyncLocal set inside an awaited method does not flow back.)
        RequestContextAccessor.Current = new RequestContext { IsRequestFromBlocksCloud = true };
    }

    [Fact]
    public void TheCapIsTen()
    {
        Cap.Should().Be(10);
    }

    [Fact]
    public async Task UpToTheCap_EveryRootFieldResolves()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(AliasedQueries(Cap));

        Errors(result).Should().BeEmpty();
        _queryCalls.Should().Be(Cap);
    }

    [Fact]
    public async Task OverTheCap_RejectedBeforeAnyResolverRuns()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(AliasedQueries(Cap + 1));

        var error = Errors(result).Should().ContainSingle().Which;
        error.Code.Should().Be(GraphQlConstant.TooManyRootFieldsErrorCode);
        error.Message.Should().Be($"The query selects {Cap + 1} root fields; at most {Cap} are allowed per operation.");
        _queryCalls.Should().Be(0);
    }

    [Fact]
    public async Task RootFieldsInsideFragments_Count()
    {
        var executor = await BuildExecutorAsync();
        var fields = string.Join(" ", Enumerable.Range(0, Cap + 1).Select(i => $"a{i}: getProducts {{ totalCount }}"));

        var result = await executor.ExecuteAsync($"query {{ ...F }} fragment F on Query {{ {fields} }}");

        Errors(result).Should().ContainSingle().Which.Code.Should().Be(GraphQlConstant.TooManyRootFieldsErrorCode);
        _queryCalls.Should().Be(0);
    }

    [Fact]
    public async Task MetaFields_DoNotCount()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(AliasedQueries(Cap).Replace("query {", "query { __typename"));

        Errors(result).Should().BeEmpty();
        _queryCalls.Should().Be(Cap);
    }

    [Fact]
    public async Task Mutations_AreCappedTheSameWay()
    {
        var executor = await BuildExecutorAsync();
        var inserts = string.Join(" ", Enumerable.Range(0, Cap + 1).Select(i => $"m{i}: insertProduct(input: {{ Title: \"t\" }}) {{ acknowledged }}"));

        var result = await executor.ExecuteAsync($"mutation {{ {inserts} }}");

        var error = Errors(result).Should().ContainSingle().Which;
        error.Code.Should().Be(GraphQlConstant.TooManyRootFieldsErrorCode);
        error.Message.Should().StartWith($"The mutation selects {Cap + 1} root fields");
        _mutationCalls.Should().Be(0);
    }

    [Fact]
    public void Rule_RejectsACapBelowOne()
    {
        var act = () => new MaxRootFieldsRule(0);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    private static string AliasedQueries(int count) =>
        "query { " + string.Join(" ", Enumerable.Range(0, count).Select(i => $"a{i}: getProducts {{ totalCount }}")) + " }";

    private static IReadOnlyList<IError> Errors(IExecutionResult result) =>
        (result as IOperationResult)?.Errors ?? [];

    /// <summary>The gateway's real schema (one Public entity) with the rule registered as ServiceRegistry does, data services mocked.</summary>
    private async Task<IRequestExecutor> BuildExecutorAsync()
    {
        await _repo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = Guid.NewGuid().ToString(),
                SchemaName = "Product",
                CollectionName = "Products",
                SchemaType = SchemaType.Entity,
                ReadAccessLevel = SchemaAccessLevel.Public,
                WriteAccessLevel = SchemaAccessLevel.Public,
                Fields = new() { new FieldDefinition { Name = "Title", Type = "String" } }
            }
        });

        var query = new Mock<IQueryService>();
        query.Setup(q => q.GetDataAsync(It.IsAny<IResolverContext>(), It.IsAny<SchemaDefinitionExtended>()))
            .ReturnsAsync(() => { Interlocked.Increment(ref _queryCalls); return new QueryResponse<Dictionary<string, object>>(); });
        var mutation = new Mock<IMutationService>();
        mutation.Setup(m => m.InsertAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<IResolverContext>(), It.IsAny<InputObjectType>(), It.IsAny<ReferenceTargets?>()))
            .ReturnsAsync(() => { Interlocked.Increment(ref _mutationCalls); return new ActionResponse { Acknowledged = true }; });
        var schemaBuilder = new GraphqlSchemaBuilder(
            new SchemaResolver(mutation.Object, query.Object), _repo, NullLogger<GraphqlSchemaBuilder>.Instance);

        var http = new DefaultHttpContext();
        http.Request.Headers["x-blocks-key"] = "tenant";
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(http);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(accessor.Object);
        services.AddGraphQLServer()
            .DisableIntrospection()
            .AddValidationRule((_, _) => new MaxRootFieldsRule(GraphQlConstant.MaxRootFieldsPerOperation))
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)));
        var provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();
    }
}
