using System.Text.Json;
using DataGateway.DomainService.Gateway;
using DataGateway.Rest.Parsing;
using FluentAssertions;
using static XUnitTest.DataGateway.Rest.RecordTestEntity;

namespace XUnitTest.DataGateway.Rest;

public class JsonRecordReaderTests
{
    private static readonly EntityModel Parcel = Model();

    private static Dictionary<string, object?> Read(string json, WriteOperation operation = WriteOperation.Insert)
        => JsonRecordReader.Read(Json(json), Parcel, operation);

    private static RestRequestException Refused(string json, WriteOperation operation = WriteOperation.Insert)
        => FluentActions.Invoking(() => Read(json, operation)).Should().Throw<RestRequestException>().Which;

    private static GatewayFieldError OnlyError(RestRequestException exception)
    {
        exception.Errors.Should().NotBeNull().And.ContainSingle();
        return exception.Errors![0];
    }

    private static T Value<T>(Dictionary<string, object?> record, string key) where T : class
        => record[key].Should().BeOfType<T>().Which;

    [Fact]
    public void Read_EveryScalarType_Coerced()
    {
        var record = Read("""
            {
              "Name": "Ann", "Code": "c-1", "Age": 42, "Score": 2, "IsActive": true,
              "Born": "2024-01-01T10:00:00+06:00", "Status": "Open",
              "Location": { "type": "Point", "coordinates": [90, 23.5] }
            }
            """);

        record["Name"].Should().Be("Ann");
        record["Code"].Should().Be("c-1");
        record["Age"].Should().BeOfType<int>().And.Be(42);
        record["Score"].Should().BeOfType<double>().And.Be(2d);
        record["IsActive"].Should().Be(true);
        var born = record["Born"].Should().BeOfType<DateTime>().Which;
        born.Kind.Should().Be(DateTimeKind.Utc);
        born.Should().Be(new DateTime(2024, 1, 1, 4, 0, 0, DateTimeKind.Utc));
        record["Status"].Should().Be("Open");
        var location = record["Location"].Should().BeOfType<Dictionary<string, object?>>().Which;
        location["type"].Should().Be("Point");
        var coordinates = location["coordinates"].Should().BeOfType<List<object?>>().Which;
        coordinates[0].Should().BeOfType<int>().And.Be(90);
        coordinates[1].Should().BeOfType<double>().And.Be(23.5);
        record.Keys.Should().BeEquivalentTo("Name", "Code", "Age", "Score", "IsActive", "Born", "Status", "Location");
    }

    [Fact]
    public void Read_ItemIdOnInsert_RenamedToDbId()
    {
        var record = Read("""{ "ItemId": "p-1", "Name": "Ann", "Tags": ["x"] }""");

        record.Should().NotContainKey("ItemId");
        record["_id"].Should().Be("p-1");
        record["Tags"].Should().BeOfType<List<object?>>().Which.Should().Equal("x");
    }

    [Fact]
    public void Read_DtoItemIdField_RenamedAtEveryLevel()
    {
        var record = Read("""{ "Lines": [ { "ItemId": "l-1", "Sku": "a" } ], "Billing": { "Detail": { "ItemId": "d-1" } } }""");

        var line = (Dictionary<string, object?>)Value<List<object?>>(record, "Lines")[0]!;
        line.Should().NotContainKey("ItemId");
        line["_id"].Should().Be("l-1");
        var detail = Value<Dictionary<string, object?>>(Value<Dictionary<string, object?>>(record, "Billing"), "Detail");
        detail.Keys.Should().BeEquivalentTo("_id");
        detail["_id"].Should().Be("d-1");
    }

    [Fact]
    public void Read_DtoSchemaWinsOverInlineRows()
    {
        // Ship's inline rows lack Detail; the Address schema (what GraphQL's AddressInput is built from) has it.
        var record = Read("""{ "Ship": { "Street": "s", "Detail": { "Sku": "x" } } }""");

        Value<Dictionary<string, object?>>(Value<Dictionary<string, object?>>(record, "Ship"), "Detail")["Sku"].Should().Be("x");
    }

    [Fact]
    public void Read_NoDtoSchemas_FallsBackToInlineRows()
    {
        var withoutDtos = new EntityModel(Parcel.Schema, null, null);
        Dictionary<string, object?> ReadWithout(string json) => JsonRecordReader.Read(Json(json), withoutDtos, WriteOperation.Insert);

        ReadWithout("""{ "Ship": { "Street": "s", "Zip": 1 } }""").Should().ContainKey("Ship");
        FluentActions.Invoking(() => ReadWithout("""{ "Ship": { "Detail": {} } }"""))
            .Should().Throw<RestRequestException>().Which.Message.Should().Be("Unknown field 'Ship.Detail'.");
        // Billing has no inline rows and no schema: nothing to check an object against.
        FluentActions.Invoking(() => ReadWithout("""{ "Billing": { "City": "c" } }"""))
            .Should().Throw<RestRequestException>().Which.Message.Should().Be("Field 'Billing' cannot be set.");
    }

    [Theory]
    [InlineData("2024-01-01T10:00:00Z")]
    [InlineData("2024-01-01")]
    [InlineData("12/31/2024")]
    public void Read_IdFieldDateLikeString_KeptAsString(string value)
    {
        // GraphQL turns such an ID into a DateTime (a bug of its ID parsing); REST keeps what was sent.
        Read($$"""{ "Code": "{{value}}" }""")["Code"].Should().BeOfType<string>().And.Be(value);
    }

    [Fact]
    public void Read_NestedDtoAndArrays()
    {
        var record = Read("""
            {
              "Ship": { "Street": "1 Main", "Zip": 1000 },
              "Billing": { "City": "Dhaka", "Detail": { "Sku": "s-0", "Price": 3 } },
              "Lines": [ { "Sku": "a", "Qty": 2 }, { "Sku": "b", "Price": 1.5 } ],
              "Nicknames": ["a", "b"],
              "Scores": [1, 2.5],
              "Levels": ["Low", "High"],
              "Zones": [ { "type": "Point", "coordinates": [1, 2] } ]
            }
            """);

        var ship = Value<Dictionary<string, object?>>(record, "Ship");
        ship["Street"].Should().Be("1 Main");
        ship["Zip"].Should().BeOfType<int>().And.Be(1000);

        var billing = Value<Dictionary<string, object?>>(record, "Billing");
        billing["City"].Should().Be("Dhaka");
        var detail = Value<Dictionary<string, object?>>(billing, "Detail");
        detail["Sku"].Should().Be("s-0");
        detail["Price"].Should().BeOfType<double>().And.Be(3d);

        var lines = Value<List<object?>>(record, "Lines");
        lines.Should().HaveCount(2).And.AllBeOfType<Dictionary<string, object?>>();
        ((Dictionary<string, object?>)lines[0]!)["Qty"].Should().BeOfType<int>().And.Be(2);
        ((Dictionary<string, object?>)lines[1]!)["Price"].Should().Be(1.5);

        Value<List<object?>>(record, "Nicknames").Should().Equal("a", "b");
        Value<List<object?>>(record, "Scores").Should().Equal(1d, 2.5d);
        Value<List<object?>>(record, "Levels").Should().Equal("Low", "High");
        Value<List<object?>>(record, "Zones").Should().ContainSingle().Which.Should().BeOfType<Dictionary<string, object?>>();
    }

    [Fact]
    public void Read_NullField_DroppedLikeGraphQL()
    {
        var record = Read("""
            { "Name": null, "Age": null, "Ship": null, "Nicknames": null, "Location": null, "Born": null,
              "Billing": { "City": null, "Street": "s", "Detail": null }, "Score": 1 }
            """);

        record.Keys.Should().BeEquivalentTo("Billing", "Score");
        var billing = Value<Dictionary<string, object?>>(record, "Billing");
        billing.Keys.Should().BeEquivalentTo("Street");
    }

    [Fact]
    public void Read_NullOnUnknownOrReadOnlyField_StillRefused()
    {
        OnlyError(Refused("""{ "Nope": null }""")).Field.Should().Be("Nope");
        OnlyError(Refused("""{ "CreatedBy": null }""")).Field.Should().Be("CreatedBy");
        OnlyError(Refused("""{ "Ship": { "Nope": null } }""")).Field.Should().Be("Ship.Nope");
    }

    [Fact]
    public void Read_NullItemInScalarArray_KeptNullItemInDtoArray_Refused()
    {
        Value<List<object?>>(Read("""{ "Nicknames": ["a", null] }"""), "Nicknames").Should().Equal(new List<object?> { "a", null });

        var error = OnlyError(Refused("""{ "Lines": [ { "Sku": "a" }, null ] }"""));
        error.Field.Should().Be("Lines[1]");
        error.Message.Should().Contain("Lines[1]");
    }

    [Fact]
    public void Read_UnknownField_IsFieldError()
    {
        var top = OnlyError(Refused("""{ "Nope": 1 }"""));
        top.Field.Should().Be("Nope");
        top.Message.Should().Be("Unknown field 'Nope'.");
        top.ValidationType.Should().Be(FieldPaths.UnknownFieldType);

        var nested = OnlyError(Refused("""{ "Ship": { "Nope": 1 } }"""));
        nested.Field.Should().Be("Ship.Nope");
        nested.Message.Should().Be("Unknown field 'Ship.Nope'.");

        OnlyError(Refused("""{ "Lines": [ { "Sku": "a" }, { "Nope": 1 } ] }""")).Field.Should().Be("Lines[1].Nope");
        OnlyError(Refused("""{ "$set": { "Name": "x" } }""")).Field.Should().Be("$set");
    }

    [Theory]
    [InlineData("CreatedBy", WriteOperation.Insert)]
    [InlineData("ItemId", WriteOperation.Update)]
    public void Read_NonWritableSystemField_IsFieldError(string field, WriteOperation operation)
    {
        var error = OnlyError(Refused($$"""{ "{{field}}": "x" }""", operation));

        error.Field.Should().Be(field);
        error.Message.Should().Contain($"'{field}'").And.Contain("cannot be set");
        error.ValidationType.Should().Be(JsonRecordReader.NotWritableType);
    }

    [Fact]
    public void Read_UpdateOperation_TakesWritableFieldsOnly()
    {
        var record = Read("""{ "Name": "Ann", "Tags": ["a"] }""", WriteOperation.Update);

        record.Keys.Should().BeEquivalentTo("Name", "Tags");
    }

    [Theory]
    [InlineData("""{ "Age": "x" }""", "Age", "Field 'Age' expects a whole number (Int).")]
    [InlineData("""{ "Age": 1.5 }""", "Age", "Field 'Age' expects a whole number (Int).")]
    [InlineData("""{ "Age": null, "Name": 5 }""", "Name", "Field 'Name' expects a string.")]
    [InlineData("""{ "Score": "1.5" }""", "Score", "Field 'Score' expects a number.")]
    [InlineData("""{ "IsActive": "true" }""", "IsActive", "Field 'IsActive' expects true or false.")]
    [InlineData("""{ "Born": "2024-01-01" }""", "Born", "Field 'Born' expects an ISO-8601 date-time with an offset or 'Z'.")]
    [InlineData("""{ "Born": "2024-01-01T10:00:00" }""", "Born", "Field 'Born' expects an ISO-8601 date-time with an offset or 'Z'.")]
    [InlineData("""{ "Born": 1700000000 }""", "Born", "Field 'Born' expects an ISO-8601 date-time with an offset or 'Z'.")]
    [InlineData("""{ "Status": 1 }""", "Status", "Field 'Status' expects an enum value name.")]
    [InlineData("""{ "Location": "POINT(1 2)" }""", "Location", "Field 'Location' expects a GeoJSON geometry object.")]
    [InlineData("""{ "Ship": "x" }""", "Ship", "Field 'Ship' expects an object.")]
    [InlineData("""{ "Ship": [] }""", "Ship", "Field 'Ship' expects an object.")]
    [InlineData("""{ "Ship": { "Zip": "x" } }""", "Ship.Zip", "Field 'Ship.Zip' expects a whole number (Int).")]
    [InlineData("""{ "Nicknames": "a" }""", "Nicknames", "Field 'Nicknames' expects an array.")]
    [InlineData("""{ "Nicknames": ["a", 2] }""", "Nicknames[1]", "Field 'Nicknames[1]' expects a string.")]
    [InlineData("""{ "Lines": { "Sku": "a" } }""", "Lines", "Field 'Lines' expects an array.")]
    [InlineData("""{ "Lines": [ "a" ] }""", "Lines[0]", "Field 'Lines[0]' expects an object.")]
    [InlineData("""{ "Lines": [ { "Sku": "a" }, { "Qty": true } ] }""", "Lines[1].Qty", "Field 'Lines[1].Qty' expects a whole number (Int).")]
    [InlineData("""{ "Billing": { "Detail": { "Price": "x" } } }""", "Billing.Detail.Price", "Field 'Billing.Detail.Price' expects a number.")]
    public void Read_WrongType_NamesFieldAndExpectedType(string json, string field, string message)
    {
        var error = OnlyError(Refused(json));

        error.Field.Should().Be(field);
        error.Message.Should().Be(message);
        error.ValidationType.Should().Be(FieldPaths.InvalidValueType);
    }

    [Theory]
    [InlineData("open")]
    [InlineData("OPEN")]
    [InlineData("Archived")]
    public void Read_EnumValue_MustBeMemberName_CaseSensitive(string value)
    {
        var error = OnlyError(Refused($$"""{ "Status": "{{value}}" }"""));

        error.Field.Should().Be("Status");
        error.Message.Should().Contain($"'{value}' is not a value of field 'Status'").And.Contain("Open, Closed, Pending");
    }

    [Fact]
    public void Read_EnumArrayValue_MustBeMemberName()
    {
        OnlyError(Refused("""{ "Levels": ["Low", "Mid"] }""")).Field.Should().Be("Levels[1]");
    }

    [Fact]
    public void Read_DuplicateProperty_Rejected()
    {
        var top = OnlyError(Refused("""{ "Name": "a", "Name": "b" }"""));
        top.Field.Should().Be("Name");
        top.Message.Should().Be("Field 'Name' was given more than once.");

        OnlyError(Refused("""{ "Ship": { "City": "a", "City": "b" } }""")).Field.Should().Be("Ship.City");
        OnlyError(Refused("""{ "Lines": [ { "Sku": "a", "Sku": "b" } ] }""")).Field.Should().Be("Lines[0].Sku");
        // Inside a GeoJSON value too: the last "type" would otherwise silently win.
        OnlyError(Refused("""{ "Location": { "type": "Point", "type": "Polygon", "coordinates": [1, 2] } }""")).Field.Should().Be("Location");
    }

    [Theory]
    [InlineData("""{ "Location": { "type": "Circle", "coordinates": [1, 2] } }""", "Location", "unknown geometry type 'Circle'")]
    [InlineData("""{ "Location": { "type": "Point", "coordinates": [1] } }""", "Location", "Point")]
    [InlineData("""{ "Location": { "type": "Point", "coordinates": [200, 0] } }""", "Location", "longitude")]
    [InlineData("""{ "Location": { "type": "Point", "coordinates": [0, 95] } }""", "Location", "latitude")]
    [InlineData("""{ "Location": {} }""", "Location", "unknown geometry type")]
    [InlineData("""{ "Zones": [ { "type": "Point", "coordinates": [1, 2] }, { "type": "Nope" } ] }""", "Zones[1]", "unknown geometry type 'Nope'")]
    public void Read_InvalidGeoJson_IsFieldError(string json, string field, string reason)
    {
        var error = OnlyError(Refused(json));

        error.Field.Should().Be(field);
        error.Message.Should().StartWith($"Invalid GeoJson value for field '{field}': ").And.Contain(reason);
    }

    [Fact]
    public void Read_WrongCaseField_SuggestsSchemaName()
    {
        var top = OnlyError(Refused("""{ "name": "x" }"""));
        top.Field.Should().Be("name");
        top.Message.Should().Be("Unknown field 'name'. Did you mean 'Name'?");

        OnlyError(Refused("""{ "Ship": { "city": "x" } }""")).Message.Should().Be("Unknown field 'Ship.city'. Did you mean 'Ship.City'?");
        OnlyError(Refused("""{ "billing": { "City": "x" } }""")).Message.Should().Be("Unknown field 'billing'. Did you mean 'Billing'?");
        OnlyError(Refused("""{ "Lines": [ { "sku": "x" } ] }""")).Message.Should().Be("Unknown field 'Lines[0].sku'. Did you mean 'Lines[0].Sku'?");
    }

    [Fact]
    public void Read_IntOverflow_IsFieldError()
    {
        var top = OnlyError(Refused("""{ "Age": 3000000000 }"""));
        top.Field.Should().Be("Age");
        top.Message.Should().Contain("3000000000").And.Contain("outside the Int range");

        OnlyError(Refused("""{ "Lines": [ { "Qty": -2147483649 } ] }""")).Field.Should().Be("Lines[0].Qty");
        Read("""{ "Age": 2147483647 }""")["Age"].Should().Be(int.MaxValue);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("\"x\"")]
    [InlineData("1")]
    [InlineData("null")]
    public void Read_NotAnObject_Rejected(string json)
    {
        var exception = Refused(json);

        exception.Message.Should().Contain("JSON object");
        exception.Errors.Should().BeNull();
    }

    [Theory]
    [InlineData("""{ "Name": "\ud800" }""", "Name")]
    [InlineData("""{ "Name": "ab\udc00" }""", "Name")]
    [InlineData("""{ "Code": "\ud800" }""", "Code")]
    [InlineData("""{ "Status": "\ud800" }""", "Status")]
    [InlineData("""{ "Born": "\ud800" }""", "Born")]
    [InlineData("""{ "Nicknames": ["a", "\ud800"] }""", "Nicknames[1]")]
    [InlineData("""{ "Ship": { "City": "\ud800" } }""", "Ship.City")]
    [InlineData("""{ "Lines": [ { "Sku": "\ud800" } ] }""", "Lines[0].Sku")]
    [InlineData("""{ "Location": { "type": "\ud800", "coordinates": [1, 2] } }""", "Location")]
    public void Read_LoneSurrogateValue_Rejected(string json, string field)
    {
        var error = OnlyError(Refused(json));

        error.Field.Should().Be(field);
        error.Message.Should().Be($"Field '{field}' contains an invalid string.");
    }

    [Theory]
    [InlineData("""{ "\ud800": 1 }""", "(root)")]
    [InlineData("""{ "Ship": { "\ud800": 1 } }""", "Ship")]
    [InlineData("""{ "Lines": [ { "\udc00": 1 } ] }""", "Lines[0]")]
    [InlineData("""{ "Location": { "\ud800": 1, "type": "Point" } }""", "Location")]
    public void Read_LoneSurrogatePropertyName_Rejected(string json, string field)
    {
        var error = OnlyError(Refused(json));

        error.Field.Should().Be(field);
        error.Message.Should().Be($"Field '{field}' contains an invalid string.");
    }

    [Fact]
    public void Read_ValidSurrogatePair_Accepted()
    {
        Read("""{ "Name": "\ud83d\ude00" }""")["Name"].Should().Be("\U0001F600");
    }

    [Fact]
    public void Read_EmptyObject_GivesEmptyRecord()
    {
        Read("{}").Should().BeEmpty();
    }

    private static string DeepCoordinates(int bodyDepth)
    {
        // { "Location": { "type": "Point", "coordinates": [[...]] } }: the object, Location and coordinates take 3 levels.
        var arrays = bodyDepth - 2;
        return $$"""{ "Location": { "type": "Point", "coordinates": {{new string('[', arrays)}}1{{new string(']', arrays)}} } }""";
    }

    [Fact]
    public void Read_DepthBeyond32_Rejected()
    {
        var exception = FluentActions.Invoking(() => JsonRecordReader.Read(ParseDeep(DeepCoordinates(33)), Parcel, WriteOperation.Insert))
            .Should().Throw<RestRequestException>().Which;
        exception.Message.Should().Contain("32");
        exception.Errors.Should().BeNull();
    }

    [Fact]
    public void Read_DepthOf32_PassesTheDepthCheck()
    {
        // Still not a valid geometry, but refused as one, not for depth.
        var exception = FluentActions.Invoking(() => JsonRecordReader.Read(ParseDeep(DeepCoordinates(32)), Parcel, WriteOperation.Insert))
            .Should().Throw<RestRequestException>().Which;
        exception.Errors.Should().ContainSingle().Which.Field.Should().Be("Location");
    }

    [Fact]
    public void Read_DepthCheckHoldsWhenCallerRaisedMaxDepth()
    {
        // The reader does not assume the caller limited the parser: 200 levels parse with MaxDepth 256.
        var json = new string('[', 200) + new string(']', 200);

        FluentActions.Invoking(() => JsonRecordReader.Read(ParseDeep($$"""{ "Location": {{json}} }"""), Parcel, WriteOperation.Insert))
            .Should().Throw<RestRequestException>().Which.Message.Should().Contain("32");
    }

    private static JsonElement ParseDeep(string json)
    {
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 256 });
        return document.RootElement.Clone();
    }

    // ---- ReadMany ----

    private static List<Dictionary<string, object?>> ReadMany(string json, int maxItems = 1000)
        => JsonRecordReader.ReadMany(Json(json), Parcel, maxItems);

    [Fact]
    public void ReadMany_Records_EachReadAsInsert()
    {
        var records = ReadMany("""[ { "ItemId": "a", "Name": "x" }, { "Name": "y", "Ship": { "City": "c" } } ]""");

        records.Should().HaveCount(2);
        records[0]["_id"].Should().Be("a");
        records[1]["Name"].Should().Be("y");
        records[1]["Ship"].Should().BeOfType<Dictionary<string, object?>>();
    }

    [Fact]
    public void ReadMany_OverMaxItems_Rejected()
    {
        var exception = FluentActions.Invoking(() => ReadMany("""[ {}, {}, {} ]""", maxItems: 2))
            .Should().Throw<RestRequestException>().Which;

        exception.Message.Should().Contain("2").And.Contain("at most");
        ReadMany("""[ {}, {} ]""", maxItems: 2).Should().HaveCount(2);
    }

    [Fact]
    public void ReadMany_EmptyArray_Rejected()
    {
        FluentActions.Invoking(() => ReadMany("[]")).Should().Throw<RestRequestException>().Which.Message.Should().Contain("at least one");
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("\"x\"")]
    [InlineData("null")]
    public void ReadMany_NotAnArray_Rejected(string json)
    {
        FluentActions.Invoking(() => ReadMany(json)).Should().Throw<RestRequestException>().Which.Message.Should().Contain("JSON array");
    }

    [Theory]
    [InlineData("""[ {}, 5 ]""")]
    [InlineData("""[ {}, null ]""")]
    [InlineData("""[ [] ]""")]
    public void ReadMany_ItemNotAnObject_NamesTheItem(string json)
    {
        var exception = FluentActions.Invoking(() => ReadMany(json)).Should().Throw<RestRequestException>().Which;

        exception.Message.Should().Contain("must be a JSON object");
    }

    [Fact]
    public void ReadMany_FieldErrorInOneItem_NamesItemAndField()
    {
        var exception = FluentActions.Invoking(() => ReadMany("""[ { "Name": "ok" }, { "Name": "ok", "Age": "x" } ]"""))
            .Should().Throw<RestRequestException>().Which;

        var error = OnlyError(exception);
        error.Field.Should().Be("[1].Age");
        error.Message.Should().Be("Item 1: Field 'Age' expects a whole number (Int).");
        error.ValidationType.Should().Be(FieldPaths.InvalidValueType);
        exception.Message.Should().Be(error.Message);
    }

    [Fact]
    public void ReadMany_NonWritableField_Refused()
    {
        var exception = FluentActions.Invoking(() => ReadMany("""[ { "CreatedBy": "x" } ]""")).Should().Throw<RestRequestException>().Which;

        OnlyError(exception).Field.Should().Be("[0].CreatedBy");
    }
}
