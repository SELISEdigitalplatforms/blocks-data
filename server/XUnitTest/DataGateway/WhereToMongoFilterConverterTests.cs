using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Models;
using FluentAssertions;
using HotChocolate;
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
        Assert.Equal(
            new BsonDocument("Address.City", new BsonDocument("$eq", "NYC")),
            result);
    }

    [Fact]
    public void Convert_NullNestedObject_ProducesNullEquality()
    {
        var where = new Dictionary<string, object?> { ["Address"] = null };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(
            new BsonDocument("Address", new BsonDocument("$eq", BsonNull.Value)),
            result);
    }

    [Fact]
    public void Convert_NullNestedScalarEquality_ProducesDottedNullEquality()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["eq"] = null }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(
            new BsonDocument("Address.City", new BsonDocument("$eq", BsonNull.Value)),
            result);
    }

    [Fact]
    public void Convert_NullNestedScalarNotEqual_ProducesDottedNotEqual()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["neq"] = null }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(
            new BsonDocument("Address.City", new BsonDocument("$ne", BsonNull.Value)),
            result);
    }

    [Fact]
    public void Convert_ExplicitNullOptional_ProducesNullEqualityAndSkipsUnsetOperators()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new StringOperationFilterInput
                {
                    Eq = new Optional<string?>(null)
                }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(
            new BsonDocument("Address.City", new BsonDocument("$eq", BsonNull.Value)),
            result);
    }

    [Fact]
    public void Convert_NullWithNonEqualityOperator_ThrowsInvalidWhereFilter()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["contains"] = null }
            }
        };

        var act = () => WhereToMongoFilterConverter.Convert(where, PersonSchema());

        act.Should().Throw<InvalidWhereFilterException>()
            .WithMessage("*does not support a null value*");
    }

    [Fact]
    public void Convert_NestedSiblingFields_UsesDottedPathsWithImplicitAnd()
    {
        var where = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?>
            {
                ["City"] = new Dictionary<string, object?> { ["eq"] = "NYC" },
                ["Zip"] = new Dictionary<string, object?> { ["in"] = new[] { "10001", "10002" } }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        result!["$and"].AsBsonArray.Should().Contain(x => x.AsBsonDocument.Contains("Address.City"));
        result["$and"].AsBsonArray.Should().Contain(x => x.AsBsonDocument.Contains("Address.Zip"));
    }

    [Fact]
    public void Convert_NestedItemId_MapsOnlyLeafToUnderscoreId()
    {
        var schema = Schema(fields: new()
        {
            Field("Child", "Child", children: new() { Field("ItemId", "ID") })
        });
        var where = new Dictionary<string, object?>
        {
            ["Child"] = new Dictionary<string, object?>
            {
                ["ItemId"] = new Dictionary<string, object?> { ["eq"] = "abc" }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, schema);

        result!.Contains("Child._id").Should().BeTrue();
    }

    [Fact]
    public void Convert_ScalarWithoutOperationObject_ThrowsInvalidWhereFilter()
    {
        var act = () => WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?> { ["Name"] = "unsafe" }, PersonSchema());

        act.Should().Throw<InvalidWhereFilterException>()
            .Which.Code.Should().Be("INVALID_WHERE_FILTER");
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

    private static SchemaDefinitionExtended ExtendedSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Age", "Int"),
        Field("IsActive", "Boolean"),
        Field("Created", "DateTime"),
        Field("Meta", "Meta", children: new())
    });

    [Fact]
    public void Convert_AndLogicalOperator()
    {
        var where = new Dictionary<string, object?>
        {
            ["and"] = new List<object?>
            {
                new Dictionary<string, object?> { ["Name"] = new Dictionary<string, object?> { ["eq"] = "A" } },
                new Dictionary<string, object?> { ["Age"] = new Dictionary<string, object?> { ["gt"] = 1 } }
            }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!.Contains("$and").Should().BeTrue();
        result["$and"].AsBsonArray.Count.Should().Be(2);
    }

    [Fact]
    public void Convert_OrWithEmptyArray_ReturnsNull()
    {
        var where = new Dictionary<string, object?> { ["or"] = new List<object?>() };
        WhereToMongoFilterConverter.Convert(where, ExtendedSchema()).Should().BeNull();
    }

    [Fact]
    public void Convert_ScalarValueNotDictionary_Throws()
    {
        var where = new Dictionary<string, object?> { ["Name"] = "John" };
        var act = () => WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        act.Should().Throw<InvalidWhereFilterException>();
    }

    [Fact]
    public void Convert_In_WithNonGenericEnumerable_ProducesArray()
    {
        var where = new Dictionary<string, object?>
        {
            ["Age"] = new Dictionary<string, object?> { ["in"] = new[] { 1, 2, 3 } }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!["Age"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(3);
    }

    [Fact]
    public void Convert_NotEqual_MapsToNe()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["neq"] = "John" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!["Name"].AsBsonDocument.Contains("$ne").Should().BeTrue();
    }

    [Fact]
    public void Convert_LessThanAndLessThanOrEqual()
    {
        var lt = WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?> { ["Age"] = new Dictionary<string, object?> { ["lt"] = 5 } },
            ExtendedSchema());
        lt!["Age"].AsBsonDocument["$lt"].AsInt32.Should().Be(5);

        var lte = WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?> { ["Age"] = new Dictionary<string, object?> { ["lte"] = 9 } },
            ExtendedSchema());
        lte!["Age"].AsBsonDocument["$lte"].AsInt32.Should().Be(9);
    }

    [Fact]
    public void Convert_EndsWith_AnchorsPattern()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["endsWith"] = "Jo" }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!["Name"].AsBsonDocument["$regex"].AsBsonRegularExpression.Pattern.Should().Be("Jo$");
    }

    [Fact]
    public void Convert_BooleanEquality()
    {
        var where = new Dictionary<string, object?>
        {
            ["IsActive"] = new Dictionary<string, object?> { ["eq"] = true }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!["IsActive"].AsBsonDocument["$eq"].AsBoolean.Should().BeTrue();
    }

    [Fact]
    public void Convert_DateTimeGreaterThanOrEqual()
    {
        var when = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var where = new Dictionary<string, object?>
        {
            ["Created"] = new Dictionary<string, object?> { ["gte"] = when }
        };
        var result = WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        result!["Created"].AsBsonDocument.Contains("$gte").Should().BeTrue();
    }

    [Fact]
    public void Convert_NestedIntoObjectWithoutChildren_Throws()
    {
        var where = new Dictionary<string, object?>
        {
            ["Meta"] = new Dictionary<string, object?>
            {
                ["Anything"] = new Dictionary<string, object?> { ["eq"] = "x" }
            }
        };
        var act = () => WhereToMongoFilterConverter.Convert(where, ExtendedSchema());
        act.Should().Throw<ArgumentException>().WithMessage("*not defined on the schema*");
    }

    [Fact]
    public void Convert_WhereAsClrInputObject_ProducesSameMongoFilterAsDictionary()
    {
        var where = new ClrWhereInput
        {
            Name = new ClrStringOp { Eq = "Abcde" }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(new BsonDocument("Name", new BsonDocument("$eq", "Abcde")), result);
    }

    [Fact]
    public void Convert_ScalarOperationAsClrInputObject_ProducesMongoFilter()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new ClrStringOp { Eq = "Abcde" }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        Assert.Equal(new BsonDocument("Name", new BsonDocument("$eq", "Abcde")), result);
    }

    [Fact]
    public void Convert_LogicalOperatorAsClrEnumerable_ProducesMongoFilter()
    {
        var where = new Dictionary<string, object?>
        {
            ["or"] = new List<object?>
            {
                new ClrWhereInput { Name = new ClrStringOp { Eq = "Abcde" } },
                new Dictionary<string, object?>
                {
                    ["Name"] = new ClrStringOp { Eq = "Fghij" }
                }
            }
        };

        var result = WhereToMongoFilterConverter.Convert(where, PersonSchema());

        result.Should().NotBeNull();
        result!.Contains("$or").Should().BeTrue();
        result["$or"].AsBsonArray.Count.Should().Be(2);
    }

    private sealed class ClrWhereInput
    {
        public ClrStringOp? Name { get; set; }
        public object? Age { get; set; }
        public object? IsActive { get; set; }
    }

    private sealed class ClrStringOp
    {
        public string? Eq { get; set; }
        public string? Neq { get; set; }
        public string? Contains { get; set; }
    }
}
