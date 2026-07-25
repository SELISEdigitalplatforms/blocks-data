using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Utilities;
using FluentAssertions;
using MongoDB.Bson;

namespace XUnitTest.DataGateway.Helpers;

public class SchemaDefinitionFilterHelperTests
{
    [Fact]
    public void GetFilter_Keyword_UsesRegex()
    {
        var filter = SchemaDefinitionFilterHelper.GetFilter(new GetSchemaDefinitionListRequest { Keyword = "per" });
        filter.Contains(nameof(SchemaDefinition.SchemaName)).Should().BeTrue();
        filter[nameof(SchemaDefinition.SchemaName)].IsBsonRegularExpression.Should().BeTrue();
    }

    [Fact]
    public void GetFilter_SchemaName_ExactMatch()
    {
        var filter = SchemaDefinitionFilterHelper.GetFilter(new GetSchemaDefinitionListRequest { SchemaName = "Person" });
        filter[nameof(SchemaDefinition.SchemaName)].AsString.Should().Be("Person");
    }

    [Fact]
    public void GetFilter_CollectionName_ExactMatch()
    {
        var filter = SchemaDefinitionFilterHelper.GetFilter(new GetSchemaDefinitionListRequest { CollectionName = "Persons" });
        filter[nameof(SchemaDefinition.CollectionName)].AsString.Should().Be("Persons");
    }

    [Fact]
    public void GetFilter_SchemaType_Added()
    {
        var filter = SchemaDefinitionFilterHelper.GetFilter(new GetSchemaDefinitionListRequest { SchemaType = SchemaType.Dto });
        filter.Contains(nameof(SchemaDefinition.SchemaType)).Should().BeTrue();
    }

    [Fact]
    public void BuildAggregationPipeline_HasMatchAndGroup()
    {
        var pipeline = SchemaDefinitionFilterHelper.BuildAggregationPipeline();
        pipeline.Should().HaveCount(2);
        pipeline[0].Contains("$match").Should().BeTrue();
        pipeline[1].Contains("$group").Should().BeTrue();
    }

    [Fact]
    public void GetSorting_Default_IsCreatedDateDescending()
    {
        var sort = SchemaDefinitionFilterHelper.GetSorting("", false);
        sort[nameof(SchemaDefinition.CreatedDate)].AsInt32.Should().Be(-1);
    }

    [Theory]
    [InlineData(true, -1)]
    [InlineData(false, 1)]
    public void GetSorting_ExplicitField(bool desc, int expected)
    {
        var sort = SchemaDefinitionFilterHelper.GetSorting("SchemaName", desc);
        sort["SchemaName"].AsInt32.Should().Be(expected);
    }
}

public class StringHelperTests
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData("default", true)]
    [InlineData("DEFAULT", true)]
    [InlineData("value", false)]
    public void IsNullOrWhiteSpaceOrDefault(string? input, bool expected)
    {
        input.IsNullOrWhiteSpaceOrDefault().Should().Be(expected);
    }
}

public class StringFormatterServiceTests
{
    [Fact]
    public void Truncate_ShorterThanMax_ReturnsSame()
    {
        StringFormatterService.Truncate("abc", 10).Should().Be("abc");
    }

    [Fact]
    public void Truncate_LongerThanMax_Truncates()
    {
        StringFormatterService.Truncate("abcdefgh", 3).Should().Be("abc");
    }

    [Fact]
    public void Truncate_TrimsTrailingDash()
    {
        StringFormatterService.Truncate("ab-cd----", 5).Should().Be("ab-cd");
    }

    [Fact]
    public void Truncate_NullOrEmpty_ReturnsInput()
    {
        StringFormatterService.Truncate("", 5).Should().Be("");
        StringFormatterService.Truncate(null!, 5).Should().BeNull();
    }
}

public class BsonConversionHelperTests
{
    [Fact]
    public void BsonDocumentToDictionary_ConvertsScalarTypes()
    {
        var doc = new BsonDocument
        {
            { "str", "hello" },
            { "i32", 5 },
            { "i64", 10L },
            { "dbl", 1.5 },
            { "boolean", true },
            { "nullVal", BsonNull.Value }
        };

        var dict = BsonConversionHelper.BsonDocumentToDictionary(doc);

        dict["str"].Should().Be("hello");
        dict["i32"].Should().Be(5);
        dict["i64"].Should().Be(10L);
        dict["dbl"].Should().Be(1.5);
        dict["boolean"].Should().Be(true);
        dict["nullVal"].Should().BeNull();
    }

    [Fact]
    public void BsonDocumentToDictionary_ConvertsNestedAndArray()
    {
        var doc = new BsonDocument
        {
            { "arr", new BsonArray { 1, 2, 3 } },
            { "nested", new BsonDocument { { "inner", "v" } } }
        };

        var dict = BsonConversionHelper.BsonDocumentToDictionary(doc);

        dict["arr"].Should().BeOfType<List<object?>>();
        ((List<object?>)dict["arr"]!).Should().HaveCount(3);
        dict["nested"].Should().BeOfType<Dictionary<string, object?>>();
    }

    [Fact]
    public void BsonValueToObject_ObjectIdAndDecimal()
    {
        var oid = ObjectId.GenerateNewId();
        BsonConversionHelper.BsonValueToObject(new BsonObjectId(oid)).Should().Be(oid.ToString());
        BsonConversionHelper.BsonValueToObject(new BsonDecimal128(1.25m)).Should().Be("1.25");
    }

    [Fact]
    public void BsonValueToObject_DateTime_ReturnsUtc()
    {
        var now = DateTime.UtcNow;
        var result = BsonConversionHelper.BsonValueToObject(new BsonDateTime(now));
        result.Should().BeOfType<DateTime>();
    }
}

public class EnvironmentMapperHelperTests
{
    [Theory]
    [InlineData("dev", "d")]
    [InlineData("test", "t")]
    [InlineData("stg", "s")]
    [InlineData("iat", "i")]
    [InlineData("uat", "u")]
    [InlineData("prod-shadow", "h")]
    [InlineData("pre-prod", "r")]
    [InlineData("prod", "p")]
    [InlineData("other", "n")]
    public void EnvironmentMapper_Maps(string env, string expected)
    {
        EnvironmentMapperHelper.EnvironmentMapper(env).Should().Be(expected);
    }
}

public class JsonValueHelperTests
{
    [Fact]
    public void ToStorableValue_NonJsonElement_ReturnsUnchanged()
    {
        JsonValueHelper.ToStorableValue("plain").Should().Be("plain");
        JsonValueHelper.ToStorableValue(42).Should().Be(42);
        JsonValueHelper.ToStorableValue(null).Should().BeNull();
    }

    [Theory]
    [InlineData("\"hello\"", "hello")]
    [InlineData("true", true)]
    [InlineData("false", false)]
    [InlineData("123", 123L)]
    public void ToStorableValue_JsonScalars(string json, object expected)
    {
        var el = System.Text.Json.JsonDocument.Parse(json).RootElement;
        JsonValueHelper.ToStorableValue(el).Should().Be(expected);
    }

    [Fact]
    public void ToStorableValue_JsonDouble()
    {
        var el = System.Text.Json.JsonDocument.Parse("1.5").RootElement;
        JsonValueHelper.ToStorableValue(el).Should().Be(1.5);
    }

    [Fact]
    public void ToStorableValue_JsonNull_ReturnsNull()
    {
        var el = System.Text.Json.JsonDocument.Parse("null").RootElement;
        JsonValueHelper.ToStorableValue(el).Should().BeNull();
    }

    [Fact]
    public void ToStorableValue_JsonArray_ReturnsObjectArray()
    {
        var el = System.Text.Json.JsonDocument.Parse("[1, \"a\", true]").RootElement;
        var result = JsonValueHelper.ToStorableValue(el) as object?[];
        result.Should().NotBeNull();
        result!.Should().HaveCount(3);
        result[0].Should().Be(1L);
        result[1].Should().Be("a");
        result[2].Should().Be(true);
    }

    [Fact]
    public void ToStorableValue_JsonObject_ReturnsRawText()
    {
        var el = System.Text.Json.JsonDocument.Parse("{\"a\":1}").RootElement;
        var result = JsonValueHelper.ToStorableValue(el) as string;
        result.Should().Contain("\"a\"");
    }
}
