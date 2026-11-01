using System.Collections;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using FluentAssertions;
using HotChocolate;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The step that turns HotChocolate's coerced argument values (CLR input objects with
/// <c>Optional&lt;T&gt;</c> members, dictionaries, lists) into the plain values the gateway engine
/// takes, so the where and order converters never see a HotChocolate type.
/// </summary>
public class GraphQLArgumentNormalizerTests
{
    private sealed class ClrWhere
    {
        public Optional<List<ClrWhere>?> And { get; set; }
        public Optional<List<ClrWhere>?> Or { get; set; }
        public Optional<StringOperationFilterInput?> Name { get; set; }
        public Optional<IntOperationFilterInput?> Age { get; set; }
        public Optional<ClrAddress?> Address { get; set; }
    }

    private sealed class ClrAddress
    {
        public Optional<StringOperationFilterInput?> City { get; set; }
        public Optional<StringOperationFilterInput?> Zip { get; set; }
    }

    private static SchemaDefinitionExtended PersonSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Age", "Int"),
        Field("Address", "Address", children: new()
        {
            Field("City", "String"),
            Field("Zip", "String")
        })
    });

    /// <summary>Walks a normalised tree and fails on anything that is not a plain value.</summary>
    private static void AssertPlain(object? value, string path = "root")
    {
        if (value is null) return;
        var type = value.GetType();
        (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Optional<>))
            .Should().BeFalse($"{path} must not hold an Optional<T>");
        type.Namespace.Should().NotStartWith("HotChocolate", $"{path} must not hold a HotChocolate type");
        type.Namespace.Should().NotBe("DataGateway.DomainService.Models", $"{path} must not hold a CLR input object");

        if (value is string) return;
        if (value is IReadOnlyDictionary<string, object?> dict)
        {
            foreach (var pair in dict) AssertPlain(pair.Value, $"{path}.{pair.Key}");
            return;
        }
        if (value is IEnumerable list)
        {
            var i = 0;
            foreach (var item in list) AssertPlain(item, $"{path}[{i++}]");
        }
    }

    [Fact]
    public void ToWhere_UnwrapsOptionalInsideAndOrLists()
    {
        var where = new ClrWhere
        {
            And = new List<ClrWhere>
            {
                new() { Name = new StringOperationFilterInput { Eq = new Optional<string?>("a") } },
                new()
                {
                    Or = new List<ClrWhere>
                    {
                        new() { Name = new StringOperationFilterInput { Contains = "b", Neq = default } },
                        new() { Age = new IntOperationFilterInput { Eq = default } },
                    },
                },
            },
        };

        var node = GraphQLArgumentNormalizer.ToWhere(where);

        node.Should().NotBeNull();
        AssertPlain(node!.Root);

        var and = node.Root["and"].Should().BeAssignableTo<IList<object?>>().Subject;
        and.Should().HaveCount(2);

        var first = and[0].Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        var firstName = first["Name"].Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        firstName["Eq"].Should().Be("a");
        // The operators that were never set are omitted rather than carried as nulls.
        firstName.Keys.Should().BeEquivalentTo(new[] { "Eq" });
        first.ContainsKey("Age").Should().BeFalse();

        var second = and[1].Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        var or = second["or"].Should().BeAssignableTo<IList<object?>>().Subject;
        or.Should().HaveCount(2);

        var orName = ((IReadOnlyDictionary<string, object?>)or[0]!)["Name"]
            .Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        orName["Contains"].Should().Be("b");
        orName.ContainsKey("Neq").Should().BeFalse();

        // An operator object whose only member was never set normalises to an empty object.
        var orAge = ((IReadOnlyDictionary<string, object?>)or[1]!)["Age"]
            .Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        orAge.Should().BeEmpty();
    }

    [Fact]
    public void ToWhere_PreservesNestedDtoPaths()
    {
        var where = new ClrWhere
        {
            Address = new ClrAddress
            {
                City = new StringOperationFilterInput { Eq = "Zurich" },
                Zip = new StringOperationFilterInput { StartsWith = "80" },
            },
        };

        var node = GraphQLArgumentNormalizer.ToWhere(where);

        AssertPlain(node!.Root);
        var address = node.Root["Address"].Should().BeAssignableTo<IReadOnlyDictionary<string, object?>>().Subject;
        ((IReadOnlyDictionary<string, object?>)address["City"]!)["Eq"].Should().Be("Zurich");
        ((IReadOnlyDictionary<string, object?>)address["Zip"]!)["StartsWith"].Should().Be("80");
    }

    [Fact]
    public void ToWhere_KeepsPlainDictionariesAndListsAsTheyAre()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["in"] = new[] { "a", "b" } },
            },
        };

        var node = GraphQLArgumentNormalizer.ToWhere(where);

        var city = ((IReadOnlyDictionary<string, object?>)((IReadOnlyDictionary<string, object?>)node!.Root["Address"]!)["City"]!);
        city["in"].Should().BeAssignableTo<IList<object?>>().Which.Should().Equal("a", "b");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not a where")]
    [InlineData(42)]
    public void ToWhere_ReturnsNull_ForNothingUsable(object? where)
        => GraphQLArgumentNormalizer.ToWhere(where).Should().BeNull();

    [Fact]
    public void ToWhere_ReturnsNull_WhenTheResultIsEmpty()
    {
        GraphQLArgumentNormalizer.ToWhere(new Dictionary<string, object?>()).Should().BeNull();
        GraphQLArgumentNormalizer.ToWhere(new Optional<object?>()).Should().BeNull();
    }

    [Fact]
    public void ToWhere_FeedsTheDictionaryConverter_ToTheSameFilterAsTheObjectOverload()
    {
        var where = new ClrWhere
        {
            Name = new StringOperationFilterInput { Contains = "x" },
            Or = new List<ClrWhere>
            {
                new() { Age = new IntOperationFilterInput { Gt = 3 } },
                new() { Address = new ClrAddress { City = new StringOperationFilterInput { Eq = "Bern" } } },
            },
        };
        var schema = PersonSchema();

        var viaObject = WhereToMongoFilterConverter.Convert((object?)where, schema);
        var viaNode = WhereToMongoFilterConverter.Convert(GraphQLArgumentNormalizer.ToWhere(where), schema);
        var viaDictionary = WhereToMongoFilterConverter.Convert(GraphQLArgumentNormalizer.ToWhere(where)!.Root, schema);

        viaObject.Should().NotBeNull();
        Assert.Equal(viaObject, viaNode);
        Assert.Equal(viaObject, viaDictionary);
    }

    [Fact]
    public void ToOrder_DefaultsDirectionToAsc()
    {
        var order = new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "Name" },
            new Dictionary<string, object?> { ["field"] = "Age", ["direction"] = "desc" },
            new Dictionary<string, object?> { ["field"] = "Zip", ["direction"] = null },
        };

        var items = GraphQLArgumentNormalizer.ToOrder(order);

        items.Should().Equal(
            new OrderItem("Name", SortDirection.ASC),
            new OrderItem("Age", SortDirection.DESC),
            new OrderItem("Zip", SortDirection.ASC));
    }

    [Fact]
    public void ToOrder_SkipsEntriesWithoutAField_AndReturnsNullWhenNothingRemains()
    {
        GraphQLArgumentNormalizer.ToOrder(null).Should().BeNull();
        GraphQLArgumentNormalizer.ToOrder(new List<object>()).Should().BeNull();
        GraphQLArgumentNormalizer.ToOrder(new List<object>
        {
            new Dictionary<string, object?> { ["direction"] = "ASC" },
            "not an entry",
        }).Should().BeNull();
    }

    [Fact]
    public void ToOrder_ReadsTheFieldName_AsTrimmedText()
    {
        var items = GraphQLArgumentNormalizer.ToOrder(new List<object>
        {
            new Dictionary<string, object?> { ["field"] = "  Name  " },
        });

        items.Should().Equal(new OrderItem("Name", SortDirection.ASC));
    }
}
