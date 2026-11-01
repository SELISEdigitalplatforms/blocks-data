using System.Collections.Immutable;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>The query half of the gateway engine, called without GraphQL.</summary>
[Collection("ContextSerial")]
public class QueryEngineTests : IDisposable
{
    private readonly Mock<IGqlDbRepository> _repo = new();

    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private MongoGatewayDataEngine Engine() =>
        new(_repo.Object, Resolver(), Principals(), NullLogger.Instance);

    private BsonDocument? _projection;

    private void SetupRepo(List<BsonDocument> docs)
    {
        _repo.Setup(r => r.GetItemsAsync(
                It.IsAny<string>(),
                It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<int>(),
                It.IsAny<int>()))
            .Callback<string, FilterDefinition<BsonDocument>, BsonDocument, BsonDocument, int, int>(
                (_, _, _, projection, _, _) => _projection = projection)
            .ReturnsAsync(docs);
        _repo.Setup(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync(docs.Count);
    }

    private static BsonDocument Doc(string name) =>
        new() { { "_id", Guid.NewGuid().ToString() }, { "Name", name } };

    private static QueryCommand Command(IReadOnlyList<string> select) =>
        new("getPersons", null, null, null, null, select);

    [Fact]
    public async Task ReadDenied_ThrowsGatewayForbidden()
    {
        ClearContext();
        SetBlocksCloud(false);
        var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });

        var act = () => Engine().QueryAsync(new EntityModel(schema, null), Command(["Name"]));

        var ex = await act.Should().ThrowAsync<GatewayException>();
        ex.Which.Code.Should().Be(GraphQlConstant.ForbiddenErrorCode);
        _repo.Verify(r => r.GetItemsAsync(
            It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task EmptySelect_ReadsLikeToday()
    {
        ClearContext();
        SetBlocksCloud(true);
        var schema = Schema(fields: new() { Field("Name") });
        SetupRepo([Doc("Alice"), Doc("Bob")]);

        // Today: `{ getPersons { totalCount } }` selects no items, so the projection is empty.
        var doc = Utf8GraphQLParser.Parse("{ getPersons { totalCount } }");
        var fieldNode = (FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0];
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.SyntaxNode).Returns(fieldNode);
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("getPersons");
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        var viaAdapter = await new QueryService(_repo.Object, Resolver(), Principals(), NullLogger<QueryService>.Instance)
            .GetDataAsync(ctx.Object, schema);
        var adapterProjection = _projection;

        var viaEngine = await Engine().QueryAsync(new EntityModel(schema, null), Command([]));

        viaEngine.Items.Should().BeEquivalentTo(viaAdapter.Items);
        viaEngine.Items.Should().HaveCount(2);
        viaEngine.PageNo.Should().Be(viaAdapter.PageNo);
        viaEngine.PageSize.Should().Be(viaAdapter.PageSize);
        _projection!.ToJson().Should().Be(adapterProjection!.ToJson());
        (await viaEngine.GetTotalCountAsync()).Should().Be(2);
    }
}
