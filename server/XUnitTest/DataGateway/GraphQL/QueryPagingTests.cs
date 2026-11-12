using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models.Constants;
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
/// The page-size cap through a real executor with the real <see cref="QueryService"/> (default cap 1000) and a
/// mocked repository: the totals a capped page reports, one invalid field next to a valid one, and how far one
/// operation can fan out. Same set-up as <see cref="QueryTotalCountTests"/>, on its Public <c>Product</c> schema.
/// </summary>
[Collection("Mongo")]
public class QueryPagingTests
{
    private readonly DbRepository _repo;
    private readonly Mock<IGqlDbRepository> _gql = new();

    public QueryPagingTests(MongoFixture fixture)
    {
        ArgumentNullException.ThrowIfNull(fixture);
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
            .ReturnsAsync(2500);
    }

    /// <summary>H9 (E3): a pageSize of 0 reads the cap, and the totals are computed from that reported page size.</summary>
    [Fact]
    public async Task PageSizeZero_ReportsTheCap_AndTotalsFromIt()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(
            "{ getProducts(paging: { pageNo: 1, pageSize: 0 }) { items { Title } pageSize totalCount totalPages hasNextPage } }");

        Errors(result).Should().BeEmpty();
        var data = Field(result, "getProducts")!;
        data["pageSize"].Should().Be(1000);
        data["totalCount"].Should().Be(2500);
        data["totalPages"].Should().Be(3);
        data["hasNextPage"].Should().Be(true);
        VerifyReads(0, 1000, Times.Once());
        _gql.Verify(r => r.CountAsync("Products", It.IsAny<FilterDefinition<BsonDocument>>()), Times.Once);
    }

    /// <summary>C3: invalid paging on one root field fails that field only; the other field of the operation still answers.</summary>
    [Fact]
    public async Task OneInvalidField_OtherFieldStillResolves()
    {
        var executor = await BuildExecutorAsync();

        var result = await executor.ExecuteAsync(
            "{ bad: getProducts(paging: { pageNo: 1, pageSize: -1 }) { items { Title } } good: getProducts(paging: { pageNo: 1, pageSize: 5 }) { items { Title } pageSize } }");

        var error = Errors(result).Should().ContainSingle().Subject;
        error.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        error.Message.Should().Be("'pageSize' must be 0 or greater.");
        error.Path!.ToList().Should().Equal("bad");
        error.Extensions.Should().NotContainKey("validationErrors");
        var data = (result as IOperationResult)!.Data!;
        data["bad"].Should().BeNull();
        Field(result, "good")!["pageSize"].Should().Be(5);
        VerifyReads(0, 5, Times.Once());
        _gql.Verify(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Once);
    }

    /// <summary>
    /// C8 (E11): ten aliased fields with pageSize 0 read ten times at the cap (at most 10 x 1000 documents), and an
    /// eleventh root field is refused before anything is read.
    /// </summary>
    [Fact]
    public async Task TenAliasedZeroPages_ReadTenTimesAtTheCap_AndAnEleventhIsRefused()
    {
        var executor = await BuildExecutorAsync();
        string Query(int fields) =>
            "{ " + string.Join(" ", Enumerable.Range(0, fields).Select(i => $"a{i}: getProducts(paging: {{ pageNo: 1, pageSize: 0 }}) {{ items {{ Title }} }}")) + " }";

        var ten = await executor.ExecuteAsync(Query(GraphQlConstant.MaxRootFieldsPerOperation));

        Errors(ten).Should().BeEmpty();
        (ten as IOperationResult)!.Data!.Should().HaveCount(10);
        VerifyReads(0, 1000, Times.Exactly(10));
        _gql.Verify(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Exactly(10));

        var eleven = await executor.ExecuteAsync(Query(GraphQlConstant.MaxRootFieldsPerOperation + 1));

        Errors(eleven).Select(e => e.Code).Should().Equal(GraphQlConstant.TooManyRootFieldsErrorCode);
        _gql.Verify(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Exactly(10));
    }

    private void VerifyReads(int skip, int limit, Times times) =>
        _gql.Verify(r => r.GetItemsAsync("Products", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), skip, limit), times);

    private static IReadOnlyList<IError> Errors(IExecutionResult result) =>
        (result as IOperationResult)?.Errors ?? [];

    private static IReadOnlyDictionary<string, object?>? Field(IExecutionResult result, string name) =>
        (result as IOperationResult)!.Data![name] as IReadOnlyDictionary<string, object?>;

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
        }).ConfigureAwait(false);

        var queryService = new QueryService(_gql.Object, Resolver(), Principals(), NullLogger<QueryService>.Instance);
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
            .AddGatewayValidation() // the 10-root-field rule (C8)
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)));
        var provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync().ConfigureAwait(false);
    }
}
