using DataGateway.DomainService.Helpers;
using FluentAssertions;
using HotChocolate.Language;
using MongoDB.Bson;

namespace XUnitTest.DataGateway;

public class GraphQlTypeHelperTests
{
    [Theory]
    [InlineData("String", true)]
    [InlineData("Int", true)]
    [InlineData("Float", true)]
    [InlineData("Boolean", true)]
    [InlineData("DateTime", true)]
    [InlineData("ID", true)]
    [InlineData("Person", false)]
    [InlineData("Address", false)]
    public void IsScalar(string type, bool expected)
    {
        GraphQlTypeHelper.IsScalar(type).Should().Be(expected);
    }

    [Theory]
    [InlineData(typeof(string), "String")]
    [InlineData(typeof(int), "Int")]
    [InlineData(typeof(long), "Int")]
    [InlineData(typeof(double), "Float")]
    [InlineData(typeof(float), "Float")]
    [InlineData(typeof(bool), "Boolean")]
    [InlineData(typeof(DateTime), "DateTime")]
    [InlineData(typeof(Guid), "ID")]
    public void GetScalarType(Type type, string expected)
    {
        GraphQlTypeHelper.GetScalarType(type).Should().Be(expected);
    }

    [Fact]
    public void GetScalarType_UnknownType_ReturnsTypeName()
    {
        GraphQlTypeHelper.GetScalarType(typeof(TimeSpan)).Should().Be("TimeSpan");
    }

    [Fact]
    public void GetTypeNode_Scalar()
    {
        GraphQlTypeHelper.GetTypeNode("String").Should().BeOfType<NamedTypeNode>()
            .Which.Name.Value.Should().Be("String");
    }

    [Fact]
    public void GetTypeNode_Array_WrapsInListType()
    {
        GraphQlTypeHelper.GetTypeNode("Int", isArray: true).Should().BeOfType<ListTypeNode>();
    }

    [Fact]
    public void GetTypeNode_Unknown_Throws()
    {
        var act = () => GraphQlTypeHelper.GetTypeNode("Nope");
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void GetCustomTypeNode_ScalarAndArray()
    {
        GraphQlTypeHelper.GetCustomTypeNode("Person").Should().BeOfType<NamedTypeNode>();
        GraphQlTypeHelper.GetCustomTypeNode("Person", isArray: true).Should().BeOfType<ListTypeNode>();
        GraphQlTypeHelper.GetCustomTypeNode("Person", isArray: false).Should().BeOfType<NamedTypeNode>();
    }

    [Theory]
    [InlineData("Name", "", "Name")]
    [InlineData("Name", "abc", "Name_abc")]
    public void GetGraphQlFieldName(string field, string shortKey, string expected)
    {
        GraphQlTypeHelper.GetGraphQlFieldName(shortKey, field).Should().Be(expected);
    }

    [Fact]
    public void ReplaceSystemFieldInFilter_ItemId_ReplacedWithId()
    {
        var filter = new BsonDocument("ItemId", "abc");
        var result = filter.ReplaceSystemFieldInFilter();
        result.Contains("_id").Should().BeTrue();
        result.Contains("ItemId").Should().BeFalse();
        result["_id"].AsString.Should().Be("abc");
    }

    [Fact]
    public void ReplaceSystemFieldInFilter_NoItemId_Unchanged()
    {
        var filter = new BsonDocument("Name", "John");
        var result = filter.ReplaceSystemFieldInFilter();
        result.Contains("Name").Should().BeTrue();
    }

    [Fact]
    public void ParseValueNode_Int()
    {
        new IntValueNode(5).ParseValueNode().Should().Be(5);
    }

    [Fact]
    public void ParseValueNode_Float()
    {
        new FloatValueNode(1.5).ParseValueNode().Should().Be(1.5);
    }

    [Fact]
    public void ParseValueNode_PlainString()
    {
        new StringValueNode("hello").ParseValueNode().Should().Be("hello");
    }

    [Fact]
    public void ParseValueNode_DateString_ReturnsDateTimeOffset()
    {
        new StringValueNode("2020-01-15T10:30:00Z").ParseValueNode().Should().BeOfType<DateTimeOffset>();
    }

    [Fact]
    public void ParseValueNode_Boolean()
    {
        new BooleanValueNode(true).ParseValueNode().Should().Be(true);
    }

    [Fact]
    public void ParseValueNode_Null()
    {
        NullValueNode.Default.ParseValueNode().Should().BeNull();
    }

    [Fact]
    public void ParseValueNode_List()
    {
        var node = new ListValueNode(new IValueNode[] { new IntValueNode(1), new IntValueNode(2) });
        var result = node.ParseValueNode();
        result.Should().BeAssignableTo<List<object?>>();
        ((List<object?>)result!).Should().HaveCount(2);
    }

    [Fact]
    public void ParseValueNode_Object()
    {
        var node = new ObjectValueNode(new ObjectFieldNode("Name", new StringValueNode("John")));
        var result = node.ParseValueNode();
        result.Should().BeAssignableTo<Dictionary<string, object?>>();
        ((Dictionary<string, object?>)result!)["Name"].Should().Be("John");
    }
}
