using System.Collections.Immutable;
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
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The GraphQL query adapter (<see cref="QueryService"/>) turns a resolver context into the engine's
/// <see cref="QueryCommand"/>; nothing else about the request reaches the engine.
/// </summary>
public class QueryAdapterCommandTests
{
    private static Mock<IResolverContext> Context(
        string query,
        DynamicQueryInput? input,
        object? where,
        object? order,
        PaginationInput? paging)
    {
        var doc = Utf8GraphQLParser.Parse(query);
        var fieldNode = (FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0];
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

    [Fact]
    public void BuildsCommandFromContext()
    {
        var where = new Dictionary<string, object?>
        {
            ["Title"] = new Dictionary<string, object?> { ["eq"] = "Dune" }
        };
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Title", ["direction"] = "DESC" }
        };
        var ctx = Context(
            "{ getBooks { totalCount items { Title Address { City } } } }",
            new DynamicQueryInput { Filter = "{\"a\":1}", Sort = "{\"b\":-1}", PageNo = 2, PageSize = 5 },
            where,
            order,
            new PaginationInput { PageNo = 3 });

        var command = QueryService.BuildQueryCommand(ctx.Object);

        command.OperationName.Should().Be("getBooks");
        command.Select.Should().Equal("Title", "Address.City");
        command.Where.Should().NotBeNull();
        command.Where!.Root.Should().ContainKey("Title");
        command.Order.Should().Equal(new OrderItem("Title", SortDirection.DESC));
        command.PageNo.Should().Be(3);   // paging overrides input per field
        command.PageSize.Should().Be(5); // input value kept, paging did not set it
        command.LegacyFilterJson.Should().Be("{\"a\":1}");
        command.LegacySortJson.Should().Be("{\"b\":-1}");
    }

    [Fact]
    public void NoArguments_GivesTodaysDefaults()
    {
        var ctx = Context("{ getBooks { items { Title } } }", null, null, null, null);

        var command = QueryService.BuildQueryCommand(ctx.Object);

        command.Where.Should().BeNull();
        command.Order.Should().BeNull();
        command.PageNo.Should().BeNull();
        command.PageSize.Should().BeNull();
        command.LegacyFilterJson.Should().Be("{}");
        command.LegacySortJson.Should().Be("{}");
    }
}
