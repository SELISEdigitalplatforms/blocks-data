using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// Counting the rows that match a query is a collection scan, so the gateway must only do it when
/// the response's <c>totalCount</c>, <c>totalPages</c> or <c>hasNextPage</c> is selected — and then
/// once, however many of those fields are selected. Proven through a real executor with the real
/// <see cref="QueryService"/> and a counted repository.
/// </summary>
[Collection("Mongo")]
public class QueryTotalCountTests
{
    private readonly DbRepository _repo;
    private readonly Mock<IGqlDbRepository> _gql = new();

    public QueryTotalCountTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        // The schema-access middleware wants a valid tenant: a Blocks Cloud request with the header present.
        RequestContextAccessor.Current = new RequestContext { IsRequestFromBlocksCloud = true };

        _gql.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { new() { { "_id", "p1" }, { "Title", "Chair" } } });
        _gql.Setup(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync(42);
    }

    [Theory]
    [InlineData("{ getProducts { items { Title } } }")]
    [InlineData("{ getProducts { items { Title } pageNo pageSize hasPreviousPage } }")]
    public async Task WithoutATotalField_NoCountIsRun(string query)
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(query);

        Errors(result).Should().BeEmpty();
        _gql.Verify(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()), Times.Never);
    }

    [Theory]
    [InlineData("{ getProducts { items { Title } totalCount } }", "totalCount", 42)]
    [InlineData("{ getProducts(paging: { pageNo: 1, pageSize: 10 }) { totalPages } }", "totalPages", 5)]
    [InlineData("{ getProducts(paging: { pageNo: 1, pageSize: 10 }) { hasNextPage } }", "hasNextPage", true)]
    [InlineData("{ getProducts { ...Totals } } fragment Totals on ProductResult { totalCount }", "totalCount", 42)]
    public async Task WithATotalField_CountsOnce(string query, string field, object expected)
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(query);

        Errors(result).Should().BeEmpty();
        var data = (result as IOperationResult)!.Data!["getProducts"] as IReadOnlyDictionary<string, object?>;
        data![field].Should().Be(expected);
        _gql.Verify(r => r.CountAsync("Products", It.IsAny<FilterDefinition<BsonDocument>>()), Times.Once);
    }

    [Fact]
    public async Task SeveralTotalFields_StillCountOnce()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync("{ getProducts(paging: { pageNo: 5, pageSize: 10 }) { totalCount totalPages hasNextPage } }");

        Errors(result).Should().BeEmpty();
        var data = (result as IOperationResult)!.Data!["getProducts"] as IReadOnlyDictionary<string, object?>;
        data!["totalCount"].Should().Be(42);
        data["totalPages"].Should().Be(5);
        data["hasNextPage"].Should().Be(false);
        _gql.Verify(r => r.CountAsync("Products", It.IsAny<FilterDefinition<BsonDocument>>()), Times.Once);
    }

    private static IReadOnlyList<IError> Errors(IExecutionResult result) =>
        (result as IOperationResult)?.Errors ?? [];

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
                Fields = new() { new FieldDefinition { Name = "Title", Type = "String" } }
            }
        });

        var queryService = new QueryService(_gql.Object, NullLogger<QueryService>.Instance);
        var schemaBuilder = new GraphqlSchemaBuilder(
            new SchemaResolver(new Mock<IMutationService>().Object, queryService), _repo, NullLogger<GraphqlSchemaBuilder>.Instance);

        var http = new DefaultHttpContext();
        http.Request.Headers["x-blocks-key"] = "tenant";
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(http);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(accessor.Object);
        services.AddGraphQLServer()
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)));
        var provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();
    }
}
