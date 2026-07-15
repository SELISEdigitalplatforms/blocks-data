using System.Text.Json;
using DataGateway.DomainService.Helpers;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class RestInputHelperTests
{
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void CoerceValue_Null_ReturnsNull()
    {
        RestInputHelper.CoerceValue(null).Should().BeNull();
    }

    [Fact]
    public void CoerceValue_NonJsonElement_ReturnedAsIs()
    {
        RestInputHelper.CoerceValue("plain").Should().Be("plain");
        RestInputHelper.CoerceValue(42).Should().Be(42);
    }

    [Fact]
    public void CoerceJsonElement_Primitives()
    {
        RestInputHelper.CoerceJsonElement(Json("true")).Should().Be(true);
        RestInputHelper.CoerceJsonElement(Json("false")).Should().Be(false);
        RestInputHelper.CoerceJsonElement(Json("null")).Should().BeNull();
        RestInputHelper.CoerceJsonElement(Json("\"hi\"")).Should().Be("hi");
    }

    [Fact]
    public void CoerceJsonElement_Number_DefaultsToLong()
    {
        RestInputHelper.CoerceJsonElement(Json("42")).Should().Be(42L);
        RestInputHelper.CoerceJsonElement(Json("3.14")).Should().Be(3.14);
    }

    [Fact]
    public void CoerceJsonElement_IntSchemaType()
    {
        RestInputHelper.CoerceJsonElement(Json("42"), "Int").Should().Be(42);
    }

    [Fact]
    public void CoerceJsonElement_DateTimeSchemaType()
    {
        var result = RestInputHelper.CoerceJsonElement(Json("\"2020-01-15T10:30:00Z\""), "DateTime");
        result.Should().BeOfType<DateTime>();
    }

    [Fact]
    public void CoerceJsonElement_Array()
    {
        var result = RestInputHelper.CoerceJsonElement(Json("[1, 2, 3]"));
        result.Should().BeAssignableTo<List<object?>>();
        ((List<object?>)result!).Should().HaveCount(3);
    }

    [Fact]
    public void CoerceJsonElement_Object()
    {
        var result = RestInputHelper.CoerceJsonElement(Json("{\"a\": 1, \"b\": \"x\"}"));
        var dict = result.Should().BeAssignableTo<Dictionary<string, object?>>().Subject;
        dict["a"].Should().Be(1L);
        dict["b"].Should().Be("x");
    }

    [Fact]
    public void CoerceInput_UsesSchemaFieldTypes()
    {
        var schema = Schema(fields: new() { Field("Age", "Int"), Field("Name", "String") });
        var input = new Dictionary<string, object?>
        {
            ["Age"] = Json("30"),
            ["Name"] = Json("\"John\"")
        };
        var result = RestInputHelper.CoerceInput(input, schema);
        result["Age"].Should().Be(30);       // coerced to Int
        result["Name"].Should().Be("John");
    }

    [Fact]
    public void CoerceObjectTree_Null()
    {
        RestInputHelper.CoerceObjectTree(null).Should().BeNull();
    }

    [Fact]
    public void CoerceObjectTree_NestedDictionaryOfJsonElements()
    {
        var tree = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = Json("\"John\"") }
        };
        var result = RestInputHelper.CoerceObjectTree(tree) as Dictionary<string, object?>;
        var inner = result!["Name"] as Dictionary<string, object?>;
        inner!["eq"].Should().Be("John");
    }

    [Fact]
    public void CoerceObjectTree_ListOfJsonElements()
    {
        var tree = new List<object?> { Json("1"), Json("2") };
        var result = RestInputHelper.CoerceObjectTree(tree) as List<object?>;
        result.Should().HaveCount(2);
        result![0].Should().Be(1L);
    }

    [Fact]
    public void CoerceObjectTree_JsonElementDirect()
    {
        RestInputHelper.CoerceObjectTree(Json("\"x\"")).Should().Be("x");
    }
}
