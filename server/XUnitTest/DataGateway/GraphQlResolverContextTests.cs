using System.Collections.Immutable;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using FluentAssertions;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// Exercises the GraphQL gateway path: helpers that read a HotChocolate IResolverContext.
/// The resolver context is mocked; syntax nodes are produced by the real GraphQL parser.
/// </summary>
[Collection("ContextSerial")]
public class GraphQlResolverContextTests
{
    private static FieldNode ParseQueryField(string query)
    {
        var doc = Utf8GraphQLParser.Parse(query);
        var op = (OperationDefinitionNode)doc.Definitions[0];
        return (FieldNode)op.SelectionSet.Selections[0];
    }

    private static Mock<IResolverContext> ContextWithSyntaxNode(FieldNode fieldNode)
    {
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.SyntaxNode).Returns(fieldNode);
        var context = new Mock<IResolverContext>();
        context.Setup(c => c.Selection).Returns(selection.Object);
        context.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return context;
    }

    [Fact]
    public void GetQueryProperties_CollectsLeafFieldsAndMapsItemId()
    {
        var fieldNode = ParseQueryField("{ getPersons { totalCount items { Name ItemId Contact { Email } } } }");
        var context = ContextWithSyntaxNode(fieldNode);

        var props = context.Object.GetQueryProperties();

        props.Should().Contain("Name");
        props.Should().Contain("_id");            // ItemId mapped
        props.Should().Contain("Contact.Email");  // nested path
        props.Should().NotContain("ItemId");
    }

    [Fact]
    public void MapQueryProjection_BuildsBsonProjection()
    {
        var fieldNode = ParseQueryField("{ getPersons { items { Name Age } } }");
        var context = ContextWithSyntaxNode(fieldNode);

        var projection = context.Object.MapQueryProjection();

        projection.Contains("Name").Should().BeTrue();
        projection.Contains("Age").Should().BeTrue();
    }

    [Fact]
    public void GetQueryProperties_NoSelectionSet_ReturnsEmpty()
    {
        // A field with no selection set (scalar) -> no items -> empty projection
        var fieldNode = ParseQueryField("{ count { items { A } } }");
        // Replace with a syntax node that has no items child
        var noItems = ParseQueryField("{ getPersons { totalCount } }");
        var context = ContextWithSyntaxNode(noItems);

        context.Object.GetQueryProperties().Should().BeEmpty();
    }

    [Fact]
    public void GetMutationProperties_ReadsInputArgumentFieldNames()
    {
        var fieldNode = ParseQueryField("{ updatePerson(input: { Name: \"John\", Age: 30 }) { itemId } }");
        var context = ContextWithSyntaxNode(fieldNode);

        var props = context.Object.GetMutationProperties();

        props.Should().BeEquivalentTo(new[] { "Name", "Age" });
    }

    [Fact]
    public void BuildBaseFilter_FromResolverContext_UsesWhere()
    {
        ClearContext();
        try
        {
            var schema = Schema(fields: new() { Field("Name", "String") });
            var where = new Dictionary<string, object?>
            {
                ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
            };
            var fieldNode = ParseQueryField("{ updatePerson { itemId } }");
            var context = ContextWithSyntaxNode(fieldNode);
            context.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns(where);
            context.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns((string?)null);

            var filter = MutationFilterHelper.BuildBaseFilter(context.Object, schema);
            filter.Contains("Name").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildBaseFilter_FromResolverContext_UsesFilterJsonWhenNoWhere()
    {
        ClearContext();
        try
        {
            var schema = Schema(fields: new() { Field("Age", "Int") });
            var fieldNode = ParseQueryField("{ updatePerson { itemId } }");
            var context = ContextWithSyntaxNode(fieldNode);
            context.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns((object?)null);
            context.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns("{\"Age\": 25}");

            var filter = MutationFilterHelper.BuildBaseFilter(context.Object, schema);
            filter["Age"].AsInt32.Should().Be(25);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildFilterWithRls_FromResolverContext_NonCustom_ReturnsBase()
    {
        ClearContext();
        try
        {
            var schema = Schema(edit: SchemaAccessLevel.Public, fields: new() { Field("Name", "String") });
            var where = new Dictionary<string, object?>
            {
                ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
            };
            var fieldNode = ParseQueryField("{ updatePerson { itemId } }");
            var context = ContextWithSyntaxNode(fieldNode);
            context.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns(where);
            context.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns((string?)null);

            PolicyEvaluationResult Evaluate(SchemaDefinitionExtended s, PolicyOperation op) =>
                new PolicyEvaluationResult { IsAccessGranted = true };

            var filter = MutationFilterHelper.BuildFilterWithRls(context.Object, schema, PolicyOperation.EDIT, Evaluate);
            filter.Contains("Name").Should().BeTrue();
            filter.Contains("$and").Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildMongoProjectionWithCls_FromResolverContext()
    {
        ClearContext();
        SetBlocksCloud(true); // skip CLS branch
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
            var fieldNode = ParseQueryField("{ getPersons { items { Name Age } } }");
            var context = ContextWithSyntaxNode(fieldNode);

            var projection = QueryProjectionHelper.BuildMongoProjectionWithCls(context.Object, schema, out var evalOnly);

            projection.Contains("Name").Should().BeTrue();
            projection.Contains("Age").Should().BeTrue();
            evalOnly.Should().BeEmpty();
        }
        finally { ClearContext(); }
    }
}
