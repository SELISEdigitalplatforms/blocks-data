using System.Text;
using DataGateway.DomainService.Gateway;
using DataGateway.Rest;
using DataGateway.Rest.Parsing;
using FluentAssertions;
using static XUnitTest.DataGateway.Rest.RestTestEntity;

namespace XUnitTest.DataGateway.Rest;

public class JsonWhereReaderTests
{
    private static readonly RestLimits Limits = new();

    private static WhereNode? Read(string json, RestLimits? limits = null) => JsonWhereReader.Read(Json(json), Order(), limits ?? Limits);

    private static IReadOnlyDictionary<string, object?> Ops(WhereNode node, string field)
        => (IReadOnlyDictionary<string, object?>)node.Root[field]!;

    [Fact]
    public void WhereReader_EmptyOrNull_IsNull()
    {
        Read("{}").Should().BeNull();
        Read("null").Should().BeNull();
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("\"Name\"")]
    [InlineData("1")]
    public void WhereReader_NotAnObject_Rejected(string json)
    {
        FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_ScalarValues_CoercedByFieldType()
    {
        var node = Read("""
            {
              "Name": { "eq": "Ann", "in": ["a", null] },
              "Age": { "gte": 18 },
              "Score": { "lt": 2 },
              "IsActive": { "eq": true },
              "Status": { "nin": ["Closed"] },
              "Location": { "eq": { "type": "Point", "coordinates": [90, 23.5] } }
            }
            """)!;

        Ops(node, "Name")["eq"].Should().Be("Ann");
        Ops(node, "Name")["in"].Should().BeEquivalentTo(new List<object?> { "a", null });
        Ops(node, "Age")["gte"].Should().BeOfType<int>().And.Be(18);
        Ops(node, "Score")["lt"].Should().BeOfType<double>().And.Be(2d);
        Ops(node, "IsActive")["eq"].Should().Be(true);
        Ops(node, "Status")["nin"].Should().BeEquivalentTo(new List<object?> { "Closed" });
        var geometry = Ops(node, "Location")["eq"].Should().BeAssignableTo<IDictionary<string, object?>>().Which;
        geometry["type"].Should().Be("Point");
        var coordinates = geometry["coordinates"].Should().BeOfType<List<object?>>().Which;
        coordinates[0].Should().BeOfType<int>().And.Be(90);
        coordinates[1].Should().BeOfType<double>().And.Be(23.5);
    }

    [Fact]
    public void WhereReader_DateTimeString_BecomesUtcDateTime()
    {
        var node = Read("""{ "CreatedDate": { "gte": "2024-03-01T10:00:00+02:00", "in": ["2024-01-01T00:00:00Z"] } }""")!;

        var gte = Ops(node, "CreatedDate")["gte"].Should().BeOfType<DateTime>().Which;
        gte.Should().Be(new DateTime(2024, 3, 1, 8, 0, 0, DateTimeKind.Utc));
        gte.Kind.Should().Be(DateTimeKind.Utc);
        var item = ((List<object?>)Ops(node, "CreatedDate")["in"]!)[0].Should().BeOfType<DateTime>().Which;
        item.Should().Be(new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    [Theory]
    [InlineData("""{ "CreatedDate": { "eq": "not a date" } }""")]
    [InlineData("""{ "CreatedDate": { "eq": 1700000000 } }""")]
    [InlineData("""{ "Age": { "eq": "18" } }""")]
    [InlineData("""{ "Age": { "eq": 1.5 } }""")]
    [InlineData("""{ "Score": { "eq": "1.5" } }""")]
    [InlineData("""{ "IsActive": { "eq": "true" } }""")]
    [InlineData("""{ "Name": { "eq": 5 } }""")]
    [InlineData("""{ "Name": { "in": "a" } }""")]
    [InlineData("""{ "Status": { "eq": "open" } }""")]
    [InlineData("""{ "Location": { "eq": "Point" } }""")]
    public void WhereReader_WrongValueType_IsFieldError(string json)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Errors.Should().ContainSingle();
    }

    [Fact]
    public void WhereReader_DollarKey_Rejected()
    {
        FluentActions.Invoking(() => Read("""{ "$where": "sleep(1000)" }""")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => Read("""{ "Name": { "$regex": ".*" } }""")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => Read("""{ "Ship": { "$where": "x" } }""")).Should().Throw<RestRequestException>();
    }

    [Theory]
    [InlineData("""{ "and": { "Name": { "eq": "a" } } }""")]
    [InlineData("""{ "or": "Name" }""")]
    [InlineData("""{ "and": null }""")]
    [InlineData("""{ "or": null }""")]
    public void WhereReader_AndNotArray_Rejected(string json)
    {
        var key = json.Contains("\"and\"", StringComparison.Ordinal) ? "and" : "or";
        FluentActions.Invoking(() => Read(json))
            .Should().Throw<RestRequestException>().WithMessage($"'{key}' must be a list of filter objects.");
    }

    [Theory]
    [InlineData("""{ "and": [1] }""")]
    [InlineData("""{ "or": [null] }""")]
    [InlineData("""{ "or": [[{ "Name": { "eq": "a" } }]] }""")]
    public void WhereReader_AndItemNotObject_Rejected(string json)
    {
        FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_AndOr_ReadAsListsOfFilters()
    {
        var node = Read("""{ "or": [{ "Name": { "eq": "a" } }, { "and": [{ "Age": { "gt": 1 } }] }] }""")!;

        var or = node.Root["or"].Should().BeOfType<List<object?>>().Which;
        or.Should().HaveCount(2);
        var inner = (IReadOnlyDictionary<string, object?>)or[1]!;
        inner["and"].Should().BeOfType<List<object?>>().Which.Should().ContainSingle();
    }

    [Theory]
    [InlineData("""{ "AND": [{ "Name": { "eq": "a" } }] }""", "AND")]
    [InlineData("""{ "Or": [{ "Name": { "eq": "a" } }] }""", "Or")]
    [InlineData("""{ "Ship": { "or": [{ "City": { "eq": "a" } }] } }""", "Ship.or")]
    public void WhereReader_LogicalKeyOutsideFilterObjectOrWrongCase_Rejected(string json, string field)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Errors.Should().ContainSingle().Which.Field.Should().Be(field);
    }

    [Fact]
    public void WhereReader_LogicalKeyInsideOperationObject_Rejected()
    {
        FluentActions.Invoking(() => Read("""{ "Name": { "and": [{ "eq": "a" }] } }"""))
            .Should().Throw<RestRequestException>().Which.Errors.Should().ContainSingle().Which.Field.Should().Be("Name");
    }

    [Theory]
    [InlineData("""{ "Name": { "startswith": "a" } }""")]
    [InlineData("""{ "Name": { "EQ": "a" } }""")]
    [InlineData("""{ "Name": { "gt": "a" } }""")]
    [InlineData("""{ "Age": { "contains": "1" } }""")]
    [InlineData("""{ "IsActive": { "in": [true] } }""")]
    [InlineData("""{ "Status": { "contains": "O" } }""")]
    [InlineData("""{ "Location": { "gt": 1 } }""")]
    [InlineData("""{ "CreatedDate": { "nin": [] } }""")]
    public void WhereReader_OperatorNotAllowedForType_Rejected(string json)
    {
        FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which.Errors.Should().ContainSingle();
    }

    [Theory]
    [InlineData("""{ "Name": "a" }""")]
    [InlineData("""{ "Ship": "a" }""")]
    [InlineData("""{ "Ship": { "City": "a" } }""")]
    public void WhereReader_FieldValueNotAnObject_Rejected(string json)
    {
        FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_NestedDtoPath_Read()
    {
        var node = Read("""{ "Ship": { "City": { "eq": "Dhaka" }, "Zip": { "gte": 1000 } } }""")!;
        var ship = (IReadOnlyDictionary<string, object?>)node.Root["Ship"]!;
        ((IReadOnlyDictionary<string, object?>)ship["Zip"]!)["gte"].Should().Be(1000);

        // Billing has no inline fields on the entity, so the converter cannot filter it: refused up front.
        FluentActions.Invoking(() => Read("""{ "Billing": { "City": { "eq": "a" } } }""")).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_DuplicateKey_Rejected()
    {
        FluentActions.Invoking(() => Read("""{ "Name": { "eq": "a" }, "Name": { "eq": "b" } }""")).Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => Read("""{ "Name": { "eq": "a", "eq": "b" } }""")).Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_GeoOperators_ReadAsObjects()
    {
        var node = Read("""
            { "Location": { "near": { "geometry": { "type": "Point", "coordinates": [90.4, 23.8] }, "maxDistanceMeters": 500 } } }
            """)!;
        var near = (IReadOnlyDictionary<string, object?>)Ops(node, "Location")["near"]!;
        near["maxDistanceMeters"].Should().Be(500d);
        near.Should().NotContainKey("minDistanceMeters");

        FluentActions.Invoking(() => Read("""{ "Location": { "near": { "geometry": { "type": "Point", "coordinates": [1, 2] }, "radius": 5 } } }"""))
            .Should().Throw<RestRequestException>();
        FluentActions.Invoking(() => Read("""{ "Location": { "within": { "type": "Polygon" } } }"""))
            .Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_DepthOverLimit_Rejected()
    {
        var limits = new RestLimits { MaxWhereDepth = 3 };

        // Depth 3: the root filter, an "and" item, and an "or" item inside it.
        Read("""{ "and": [{ "or": [{ "Name": { "eq": "a" } }] }] }""", limits).Should().NotBeNull();
        FluentActions.Invoking(() => Read("""{ "and": [{ "or": [{ "and": [{ "Name": { "eq": "a" } }] }] }] }""", limits))
            .Should().Throw<RestRequestException>();
        // A nested DTO object is a level too.
        FluentActions.Invoking(() => Read("""{ "and": [{ "or": [{ "Ship": { "City": { "eq": "a" } } }] }] }""", limits))
            .Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_DepthOverDefaultLimit_Rejected()
    {
        FluentActions.Invoking(() => Read(Nested(9))).Should().Throw<RestRequestException>();
        Read(Nested(8)).Should().NotBeNull();
    }

    [Fact]
    public void WhereReader_ConditionsOverLimit_Rejected()
    {
        Read(OrOf(100)).Should().NotBeNull();
        FluentActions.Invoking(() => Read(OrOf(101))).Should().Throw<RestRequestException>();

        var limits = new RestLimits { MaxWhereConditions = 2 };
        Read("""{ "Name": { "eq": "a" }, "Age": { "gt": 1 } }""", limits).Should().NotBeNull();
        FluentActions.Invoking(() => Read("""{ "Name": { "eq": "a", "neq": "b" }, "Age": { "gt": 1 } }""", limits))
            .Should().Throw<RestRequestException>();
    }

    [Fact]
    public void WhereReader_WrongCaseField_SuggestsSchemaName()
    {
        var ex = FluentActions.Invoking(() => Read("""{ "email": { "eq": "a@x.com" } }"""))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'email'. Did you mean 'Email'?").Which;
        var error = ex.Errors.Should().ContainSingle().Which;
        error.Field.Should().Be("email");
        error.Message.Should().Be("Unknown field 'email'. Did you mean 'Email'?");

        FluentActions.Invoking(() => Read("""{ "Ship": { "city": { "eq": "a" } } }"""))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Ship.city'. Did you mean 'Ship.City'?");
        FluentActions.Invoking(() => Read("""{ "Nope": { "eq": "a" } }"""))
            .Should().Throw<RestRequestException>().WithMessage("Unknown field 'Nope'.");
    }

    [Theory]
    [InlineData("""{ "Age": { "eq": 3000000000 } }""", "Age")]
    [InlineData("""{ "Age": { "in": [1, -3000000000] } }""", "Age")]
    [InlineData("""{ "Ship": { "Zip": { "gt": 99999999999 } } }""", "Ship.Zip")]
    public void WhereReader_IntOverflow_IsFieldError(string json, string field)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Errors.Should().ContainSingle().Which.Field.Should().Be(field);
    }

    // ---- R9: shapes the converter would silently drop, widening the filter ----

    [Theory]
    [InlineData("""{ "Email": null }""", "Email", "Field 'Email' must be a filter object, not null.")]
    [InlineData("""{ "Ship": null }""", "Ship", "Field 'Ship' must be a filter object, not null.")]
    [InlineData("""{ "Ship": { "City": null } }""", "Ship.City", "Field 'Ship.City' must be a filter object, not null.")]
    [InlineData("""{ "Email": { "eq": null } }""", "Email", "Operator 'eq' on 'Email' needs a value; null is not supported.")]
    [InlineData("""{ "Age": { "in": null } }""", "Age", "Operator 'in' on 'Age' needs a value; null is not supported.")]
    [InlineData("""{ "CreatedDate": { "gt": null } }""", "CreatedDate", "Operator 'gt' on 'CreatedDate' needs a value; null is not supported.")]
    [InlineData("""{ "Location": { "near": null } }""", "Location", "Operator 'near' on 'Location' needs a value; null is not supported.")]
    [InlineData("""{ "Email": { "eq": "" } }""", "Email", "Operator 'eq' on 'Email' cannot compare with an empty string.")]
    [InlineData("""{ "Email": { "neq": "" } }""", "Email", "Operator 'neq' on 'Email' cannot compare with an empty string.")]
    [InlineData("""{ "Ship": { "City": { "eq": "" } } }""", "Ship.City", "Operator 'eq' on 'Ship.City' cannot compare with an empty string.")]
    [InlineData("""{ "Email": {} }""", "Email", "Field 'Email' needs at least one operator.")]
    [InlineData("""{ "Ship": {} }""", "Ship", "Field 'Ship' needs at least one condition.")]
    public void WhereReader_ShapeThatWouldWidenFilter_Rejected(string json, string field, string message)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Message.Should().Be(message);
        var error = ex.Errors.Should().ContainSingle().Which;
        error.Field.Should().Be(field);
        error.Message.Should().Be(message);
    }

    [Theory]
    [InlineData("""{ "or": [] }""", "'or' must contain at least one filter object.")]
    [InlineData("""{ "and": [] }""", "'and' must contain at least one filter object.")]
    [InlineData("""{ "and": [{ "Name": { "eq": "a" } }, { "or": [] }] }""", "'or' must contain at least one filter object.")]
    [InlineData("""{ "or": [{}] }""", "Each item in 'or' needs at least one condition.")]
    [InlineData("""{ "and": [{ "Name": { "eq": "a" } }, {}] }""", "Each item in 'and' needs at least one condition.")]
    public void WhereReader_EmptyLogicalList_Rejected(string json, string message)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Message.Should().Be(message);
        ex.Errors.Should().BeNull();
    }

    [Fact]
    public void WhereReader_OrItemThatWouldReduceToNothing_Rejected()
    {
        var ex = FluentActions.Invoking(() => Read("""{ "or": [{ "Email": { "eq": null } }] }"""))
            .Should().Throw<RestRequestException>().Which;
        ex.Message.Should().Be("Operator 'eq' on 'Email' needs a value; null is not supported.");
        ex.Errors.Should().ContainSingle().Which.Field.Should().Be("Email");
    }

    [Fact]
    public void WhereReader_NullInListItem_StillAccepted()
    {
        // Not a dropped condition: "in" with a null item matches records whose value is null.
        Read("""{ "Name": { "in": [null] } }""").Should().NotBeNull();
        // An empty string is only refused for eq/neq, where the converter would drop it.
        Read("""{ "Name": { "in": [""] } }""").Should().NotBeNull();
    }

    // ---- R9b: an empty pattern matches every record ----

    [Theory]
    [InlineData("""{ "Email": { "contains": "" } }""", "Email", "Operator 'contains' on 'Email' cannot use an empty string.")]
    [InlineData("""{ "Email": { "startsWith": "" } }""", "Email", "Operator 'startsWith' on 'Email' cannot use an empty string.")]
    [InlineData("""{ "Ship": { "City": { "endsWith": "" } } }""", "Ship.City", "Operator 'endsWith' on 'Ship.City' cannot use an empty string.")]
    public void WhereReader_EmptyPattern_Rejected(string json, string field, string message)
    {
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Message.Should().Be(message);
        var error = ex.Errors.Should().ContainSingle().Which;
        error.Field.Should().Be(field);
        error.Message.Should().Be(message);
    }

    // ---- R8: one pattern operator per field ----

    [Theory]
    [InlineData("""{ "Email": { "contains": "a", "endsWith": "b" } }""", "Email")]
    [InlineData("""{ "Email": { "startsWith": "a", "contains": "b" } }""", "Email")]
    [InlineData("""{ "Ship": { "City": { "startsWith": "a", "endsWith": "b" } } }""", "Ship.City")]
    public void WhereReader_TwoPatternOperatorsOnOneField_Rejected(string json, string field)
    {
        const string message = "Only one of 'contains', 'startsWith' or 'endsWith' may be used on a field; combine conditions with 'and'.";
        var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
        ex.Message.Should().Be(message);
        ex.Errors.Should().ContainSingle().Which.Field.Should().Be(field);
    }

    [Fact]
    public void WhereReader_PatternOperatorsSplitAcrossAnd_Accepted()
    {
        Read("""{ "and": [{ "Email": { "startsWith": "a" } }, { "Email": { "endsWith": "b" } }] }""").Should().NotBeNull();
        Read("""{ "Email": { "contains": "a", "neq": "x", "in": ["a"] } }""").Should().NotBeNull();
    }

    // ---- R10: DateTime is ISO-8601 with an offset or Z ----

    [Theory]
    [InlineData("2024-01-01T10:00:00Z", "2024-01-01T10:00:00.0000000Z")]
    [InlineData("2024-01-01T10:00:00+06:00", "2024-01-01T04:00:00.0000000Z")]
    [InlineData("2024-01-01T10:00:00.125-02:30", "2024-01-01T12:30:00.1250000Z")]
    [InlineData("2024-06-30T23:59:59.9999999+00:00", "2024-06-30T23:59:59.9999999Z")]
    public void WhereReader_DateTimeWithOffset_BecomesUtc(string text, string expectedUtc)
    {
        var node = Read($$"""{ "CreatedDate": { "eq": "{{text}}", "in": ["{{text}}"] } }""")!;

        var eq = Ops(node, "CreatedDate")["eq"].Should().BeOfType<DateTime>().Which;
        eq.Kind.Should().Be(DateTimeKind.Utc);
        eq.ToString("O", System.Globalization.CultureInfo.InvariantCulture).Should().Be(expectedUtc);
        ((List<object?>)Ops(node, "CreatedDate")["in"]!).Should().Equal(eq);
    }

    [Theory]
    [InlineData("2024-01-01")]
    [InlineData("2024-01-01T00:00:00")]
    [InlineData("1/2/2024")]
    [InlineData("2024-01-01 10:00:00Z")]
    [InlineData("2024-01-01T10:00Z")]
    [InlineData("2024-01-01T10:00:00+0600")]
    [InlineData("2024-13-01T10:00:00Z")]
    [InlineData("")]
    public void WhereReader_DateTimeWithoutOffset_Rejected(string text)
    {
        const string message = "Field 'CreatedDate' expects an ISO-8601 date-time with an offset or 'Z'.";
        foreach (var json in new[]
                 {
                     $$"""{ "CreatedDate": { "gte": "{{text}}" } }""",
                     $$"""{ "CreatedDate": { "in": ["2024-01-01T00:00:00Z", "{{text}}"] } }"""
                 })
        {
            var ex = FluentActions.Invoking(() => Read(json)).Should().Throw<RestRequestException>().Which;
            ex.Message.Should().Be(message);
            ex.Errors.Should().ContainSingle().Which.Field.Should().Be("CreatedDate");
        }
    }

    [Fact]
    public void WhereReader_LoneSurrogate_IsFieldErrorNot500()
    {
        // Parses as JSON, but cannot be read as a string: it must be a 400, not an InvalidOperationException.
        var value = FluentActions.Invoking(() => Read("""{ "Name": { "eq": "\ud800" } }""")).Should().Throw<RestRequestException>().Which;
        value.Errors.Should().ContainSingle().Which.Field.Should().Be("Name");
        value.Message.Should().Be("Field 'Name' contains an invalid string.");

        var inList = FluentActions.Invoking(() => Read("""{ "Name": { "in": ["a", "\udc00"] } }""")).Should().Throw<RestRequestException>().Which;
        inList.Message.Should().Be("Field 'Name' contains an invalid string.");

        var name = FluentActions.Invoking(() => Read("""{ "\ud800": { "eq": "a" } }""")).Should().Throw<RestRequestException>().Which;
        name.Errors.Should().ContainSingle().Which.Field.Should().Be("(root)");
        name.Message.Should().Be("Field '(root)' contains an invalid string.");

        FluentActions.Invoking(() => Read("""{ "Name": { "\ud800": "a" } }""")).Should().Throw<RestRequestException>()
            .Which.Message.Should().Be("Field 'Name' contains an invalid string.");
    }

    private static string Nested(int depth)
    {
        // depth 1 is the root filter; each "and" item adds one level.
        var json = """{ "Name": { "eq": "a" } }""";
        for (var i = 1; i < depth; i++)
            json = $$"""{ "and": [{{json}}] }""";
        return json;
    }

    private static string OrOf(int conditions)
    {
        var builder = new StringBuilder("""{ "or": [""");
        for (var i = 0; i < conditions; i++)
        {
            if (i > 0) builder.Append(',');
            builder.Append($$"""{ "Age": { "eq": {{i}} } }""");
        }
        return builder.Append("] }").ToString();
    }
}
