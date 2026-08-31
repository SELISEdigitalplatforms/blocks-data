using System.Collections.Immutable;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Exercises <see cref="QueryService"/> end to end with a mocked repository and a
/// HotChocolate resolver context. Selection syntax nodes are produced by the real parser.
/// </summary>
[Collection("ContextSerial")]
public class QueryServiceTests
{
    private readonly Mock<IGqlDbRepository> _repo = new();
    private readonly QueryService _service;

    public QueryServiceTests()
    {
        _service = new QueryService(_repo.Object, NullLogger<QueryService>.Instance);
    }

    private static FieldNode ParseQueryField(string query)
    {
        var doc = Utf8GraphQLParser.Parse(query);
        var op = (OperationDefinitionNode)doc.Definitions[0];
        return (FieldNode)op.SelectionSet.Selections[0];
    }

    private static Mock<IResolverContext> Context(
        string query = "{ getPersons { items { Name Age } } }",
        DynamicQueryInput? input = null,
        object? where = null,
        object? order = null,
        PaginationInput? paging = null)
    {
        var fieldNode = ParseQueryField(query);
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.SyntaxNode).Returns(fieldNode);
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns(fieldNode.Name.Value);
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        ctx.Setup(c => c.ArgumentValue<DynamicQueryInput?>(GraphQlConstant.InputFieldName)).Returns(input);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns(where);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.OrderFieldName)).Returns(order);
        ctx.Setup(c => c.ArgumentValue<PaginationInput?>(GraphQlConstant.PagingFieldName)).Returns(paging);
        return ctx;
    }

    private void SetupRepo(List<BsonDocument> docs, long count) =>
        _repo.Setup(r => r.GetItemsWithCountAsync(
                It.IsAny<string>(),
                It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<int>(),
                It.IsAny<int>()))
            .ReturnsAsync((docs, count));

    private static BsonDocument Doc(string name, int age) =>
        new() { { "_id", Guid.NewGuid().ToString() }, { "Name", name }, { "Age", age } };

    [Fact]
    public async Task GetDataAsync_Public_ReturnsMappedItems_WithClsPath()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
            SetupRepo(new List<BsonDocument> { Doc("Alice", 30), Doc("Bob", 25) }, 2);

            var result = await _service.GetDataAsync(Context().Object, schema);

            result.TotalCount.Should().Be(2);
            result.Items.Should().HaveCount(2);
            result.PageNo.Should().Be(1);
            result.PageSize.Should().Be(2); // no PageSize supplied => falls back to item count
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_BlocksCloud_UsesSimpleMapping()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name") });
            SetupRepo(new List<BsonDocument> { Doc("Alice", 30) }, 1);

            var result = await _service.GetDataAsync(Context().Object, schema);

            result.Items.Should().HaveCount(1);
            result.Items[0].Should().ContainKey("Name");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_InputFilterSortPaging_AppliesPaginationAndFilter()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
            SetupRepo(new List<BsonDocument> { Doc("Alice", 30) }, 42);

            var input = new DynamicQueryInput
            {
                Filter = "{\"Name\": \"Alice\"}",
                Sort = "{\"Age\": -1}",
                PageNo = 1,
                PageSize = 5
            };
            // paging overrides input page values
            var paging = new PaginationInput { PageNo = 3, PageSize = 7 };

            var result = await _service.GetDataAsync(Context(input: input, paging: paging).Object, schema);

            result.TotalCount.Should().Be(42);
            result.PageNo.Should().Be(3);
            result.PageSize.Should().Be(7);
            _repo.Verify(r => r.GetItemsWithCountAsync(
                schema.CollectionName,
                It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(),
                14, // (3-1)*7
                7), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_InvalidFilterJson_FallsBackToEmptyFilter()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name") });
            SetupRepo(new List<BsonDocument>(), 0);

            var input = new DynamicQueryInput { Filter = "not-json" };
            var result = await _service.GetDataAsync(Context(input: input).Object, schema);

            result.TotalCount.Should().Be(0);
            result.Items.Should().BeEmpty();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_WhereAndOrderObjects_AreConverted()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
            SetupRepo(new List<BsonDocument> { Doc("Alice", 30) }, 1);

            var where = new Dictionary<string, object?>
            {
                ["Name"] = new Dictionary<string, object?> { ["eq"] = "Alice" }
            };
            var order = new Dictionary<string, object?> { ["Age"] = "DESC" };

            var result = await _service.GetDataAsync(Context(where: where, order: order).Object, schema);

            result.Items.Should().HaveCount(1);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_CustomRls_NoPolicy_ThrowsUnauthorized()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });

            var act = () => _service.GetDataAsync(Context().Object, schema);

            var ex = await act.Should().ThrowAsync<GraphQLException>();
            ex.Which.Errors[0].Code.Should().Be(GraphQlConstant.UnauthorizedErrorCode);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetDataAsync_RepositoryThrows_LogsAndRethrows()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name") });
            _repo.Setup(r => r.GetItemsWithCountAsync(
                    It.IsAny<string>(),
                    It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument>(),
                    It.IsAny<BsonDocument>(),
                    It.IsAny<int>(),
                    It.IsAny<int>()))
                .ThrowsAsync(new InvalidOperationException("boom"));

            var act = () => _service.GetDataAsync(Context().Object, schema);

            await act.Should().ThrowAsync<InvalidOperationException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateRlsPolicies_NonCustom_GrantsAccess()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Public);
            var result = _service.EvaluateRlsPolicies(schema, PolicyOperation.READ);
            result.IsAccessGranted.Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateRlsPolicies_CustomFromCloud_GrantsAccess()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom);
            var result = _service.EvaluateRlsPolicies(schema, PolicyOperation.READ);
            result.IsAccessGranted.Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateRlsPolicies_CustomNoPolicy_DeniesAccess()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom);
            var result = _service.EvaluateRlsPolicies(schema, PolicyOperation.READ);
            result.IsAccessGranted.Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateRlsPolicies_CustomWithPolicy_EvaluatesGroup()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND));
            var schema = Schema(read: SchemaAccessLevel.Custom, policies: new() { policy });

            var result = _service.EvaluateRlsPolicies(schema, PolicyOperation.READ);

            result.Should().NotBeNull();
        }
        finally { ClearContext(); }
    }
}
