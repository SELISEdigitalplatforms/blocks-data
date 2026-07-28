using DataGateway.DomainService.Entities;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace XUnitTest.DataGateway;

/// <summary>
/// Exercises <see cref="PolicyStaticValueSerializer"/> by round-tripping a PolicyRule through BSON
/// (the serializer is attached to <see cref="PolicyRule.StaticValue"/> via attribute) and by
/// deserializing hand-built BSON values for the type branches that typed input cannot produce.
/// </summary>
public class PolicyStaticValueSerializerTests
{
    private static object? RoundTrip(object? value)
    {
        var rule = new PolicyRule { StaticValue = value };
        var doc = rule.ToBsonDocument();
        return BsonSerializer.Deserialize<PolicyRule>(doc).StaticValue;
    }

    private static object? DeserializeRaw(BsonValue staticValue)
    {
        var doc = new BsonDocument { { nameof(PolicyRule.StaticValue), staticValue } };
        return BsonSerializer.Deserialize<PolicyRule>(doc).StaticValue;
    }

    [Fact]
    public void RoundTrip_Null_ReturnsNull() => RoundTrip(null).Should().BeNull();

    [Fact]
    public void RoundTrip_String() => RoundTrip("hello").Should().Be("hello");

    [Fact]
    public void RoundTrip_Int() => RoundTrip(42).Should().Be(42);

    [Fact]
    public void RoundTrip_Long() => RoundTrip(9_000_000_000L).Should().Be(9_000_000_000L);

    [Fact]
    public void RoundTrip_Double() => RoundTrip(3.14).Should().Be(3.14);

    [Fact]
    public void RoundTrip_Bool() => RoundTrip(true).Should().Be(true);

    [Fact]
    public void RoundTrip_Decimal_BecomesDouble()
    {
        // Serialized as Decimal128, read back as double per the serializer contract.
        RoundTrip(1.5m).Should().Be(1.5d);
    }

    [Fact]
    public void RoundTrip_DateTime_PreservedUtc()
    {
        var dt = new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var result = RoundTrip(dt);
        result.Should().BeOfType<DateTime>();
        ((DateTime)result!).Should().BeCloseTo(dt, TimeSpan.FromMilliseconds(1));
    }

    [Fact]
    public void RoundTrip_StringArray()
    {
        var result = RoundTrip(new[] { "a", "b", "c" });
        result.Should().BeOfType<object?[]>();
        ((object?[])result!).Should().BeEquivalentTo(new object?[] { "a", "b", "c" });
    }

    [Fact]
    public void RoundTrip_ObjectArray_Mixed()
    {
        var result = RoundTrip(new object[] { "x", 1, true });
        ((object?[])result!).Should().BeEquivalentTo(new object?[] { "x", 1, true });
    }

    [Fact]
    public void RoundTrip_EnumerableOfObject_SerializedAsArray()
    {
        var result = RoundTrip(new List<object> { "p", 2 });
        result.Should().BeOfType<object?[]>();
        ((object?[])result!).Should().BeEquivalentTo(new object?[] { "p", 2 });
    }

    [Fact]
    public void RoundTrip_UnknownType_FallsBackToString()
    {
        var guid = Guid.NewGuid();
        RoundTrip(guid).Should().Be(guid.ToString());
    }

    [Fact]
    public void Deserialize_Document_ReturnsDictionary()
    {
        var result = DeserializeRaw(new BsonDocument { { "Name", "John" }, { "Age", 30 } });
        result.Should().BeOfType<Dictionary<string, object?>>();
        var dict = (Dictionary<string, object?>)result!;
        dict["Name"].Should().Be("John");
        dict["Age"].Should().Be(30);
    }

    [Fact]
    public void Deserialize_NestedArrayAndDocument()
    {
        var raw = new BsonDocument
        {
            { "Tags", new BsonArray { "a", "b" } },
            { "Meta", new BsonDocument { { "K", 1 } } }
        };
        var dict = (Dictionary<string, object?>)DeserializeRaw(raw)!;
        ((object?[])dict["Tags"]!).Should().BeEquivalentTo(new object?[] { "a", "b" });
        ((Dictionary<string, object?>)dict["Meta"]!)["K"].Should().Be(1);
    }

    [Fact]
    public void Deserialize_ObjectId_ReturnsString()
    {
        var id = ObjectId.GenerateNewId();
        DeserializeRaw(id).Should().Be(id.ToString());
    }

    [Fact]
    public void Deserialize_Decimal128_ReturnsDouble()
    {
        DeserializeRaw(new BsonDecimal128(2.5m)).Should().Be(2.5d);
    }

    [Fact]
    public void Deserialize_Int64_ReturnsLong()
    {
        DeserializeRaw(new BsonInt64(123456789012L)).Should().Be(123456789012L);
    }

    [Fact]
    public void Deserialize_Undefined_ReturnsNull()
    {
        DeserializeRaw(BsonUndefined.Value).Should().BeNull();
    }

    [Fact]
    public void Deserialize_UnknownBsonType_SkippedAsNull()
    {
        // Timestamp is not a handled type -> default branch skips and returns null.
        DeserializeRaw(new BsonTimestamp(123L)).Should().BeNull();
    }
}
