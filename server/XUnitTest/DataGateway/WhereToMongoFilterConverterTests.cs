using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class WhereToMongoFilterConverterTests
{
    private static SchemaDefinitionExtended PersonSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Age", "Int"),
        Field("IsActive", "Boolean"),
        Field("ItemId", "ID"),
        Field("Address", "Address", children: new()
        {
            Field("City", "String"),
            Field("Zip", "String")
        })
    });

    [Fact]
    public void Convert_Null_ReturnsNull()
    {
        WhereToMongoFilterConverter.Convert(null, PersonSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_EmptyDictionary_ReturnsNull()
    {
        WhereToMongoFilterConverter.Convert(new Dictionary<string, object?>(), PersonSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_SimpleEquality_String()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        Assert.Equal(new BsonDocument("Name", new BsonDocument("$eq", "John")), result);
    }

    [Fact]
    public void Convert_EmptyStringEquality_IsSkipped()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "" }
        };
        WhereToMongoFilterConverter.Convert(where, PersonSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_Contains_ProducesRegex()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["contains"] = "Jo" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        var regex = result!["Name"].AsBsonDocument["$regex"].AsBsonRegularExpression;
        regex.Pattern.Should().Be("Jo");
        regex.Options.Should().Be("i");
    }

    [Fact]
    public void Convert_StartsWith_AnchorsPattern()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["startsWith"] = "Jo" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!["Name"].AsBsonDocument["$regex"].AsBsonRegularExpression.Pattern.Should().Be("^Jo");
    }

    [Fact]
    public void Convert_In_ProducesArray()
    {
        var where = new Dictionary<string, object?>
        {
            ["Age"] = new Dictionary<string, object?> { ["in"] = new List<object?> { 20, 30 } }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!["Age"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(2);
    }

    [Fact]
    public void Convert_NumericGreaterThan()
    {
        var where = new Dictionary<string, object?>
        {
            ["Age"] = new Dictionary<string, object?> { ["gt"] = 18 }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!["Age"].AsBsonDocument["$gt"].AsInt32.Should().Be(18);
    }

    [Fact]
    public void Convert_ItemId_MapsToUnderscoreId()
    {
        var where = new Dictionary<string, object?>
        {
            ["ItemId"] = new Dictionary<string, object?> { ["eq"] = "abc" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!.Contains("_id").Should().BeTrue();
    }

    [Fact]
    public void Convert_MultipleFields_WrappedInAnd()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" },
            ["Age"] = new Dictionary<string, object?> { ["gte"] = 21 }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!.Contains("$and").Should().BeTrue();
        result["$and"].AsBsonArray.Count.Should().Be(2);
    }

    [Fact]
    public void Convert_OrLogicalOperator()
    {
        var where = new Dictionary<string, object?>
        {
            ["or"] = new List<object?>
            {
                new Dictionary<string, object?> { ["Name"] = new Dictionary<string, object?> { ["eq"] = "A" } },
                new Dictionary<string, object?> { ["Name"] = new Dictionary<string, object?> { ["eq"] = "B" } }
            }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!.Contains("$or").Should().BeTrue();
        result["$or"].AsBsonArray.Count.Should().Be(2);
    }

    [Fact]
    public void Convert_NestedObjectField()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["eq"] = "NYC" }
            }
        };
        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());
        result!.Contains("Address").Should().BeTrue();
    }

    [Fact]
    public void Convert_UnknownField_Throws()
    {
        var where = new Dictionary<string, object?>
        {
            ["Unknown"] = new Dictionary<string, object?> { ["eq"] = "x" }
        };
        var act = () => WhereToMongoFilterConverter.Convert(where, PersonSchema());
        act.Should().Throw<ArgumentException>().WithMessage("*not defined on the schema*");
    }

    [Fact]
    public void Convert_DollarPrefixedField_Throws()
    {
        var where = new Dictionary<string, object?>
        {
            ["$where"] = new Dictionary<string, object?> { ["eq"] = "x" }
        };
        var act = () => WhereToMongoFilterConverter.Convert(where, PersonSchema());
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Convert_UnsupportedOperator_Throws()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["gt"] = "x" } // gt not allowed for String
        };
        var act = () => WhereToMongoFilterConverter.Convert(where, PersonSchema());
        act.Should().Throw<ArgumentException>().WithMessage("*Unsupported or invalid operator*");
    }

    [Fact]
    public void Convert_NullFieldValue_Skipped()
    {
        var where = new Dictionary<string, object?> { ["Name"] = null };
        WhereToMongoFilterConverter.Convert(where, PersonSchema()).Should().BeNull();
    }
}
