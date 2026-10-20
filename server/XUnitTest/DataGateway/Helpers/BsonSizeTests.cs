using DataGateway.DomainService.Helpers;
using FluentAssertions;
using MongoDB.Bson;

namespace XUnitTest.DataGateway.Helpers;

/// <summary>
/// The request log's "DB response size" must not change: <see cref="BsonSize.Of"/> has to equal
/// <c>ToBson().Length</c> for every kind of document.
/// </summary>
public class BsonSizeTests
{
    public static TheoryData<BsonDocument> Documents() => new()
    {
        new BsonDocument(),
        new BsonDocument { { "_id", "a" } },
        new BsonDocument
        {
            { "_id", Guid.NewGuid().ToString() },
            { "Name", "Ünïcødé ✓ text" },
            { "Count", 42 },
            { "Big", long.MaxValue },
            { "Ratio", 0.125 },
            { "Price", new BsonDecimal128(12.34m) },
            { "Flag", true },
            { "Nothing", BsonNull.Value },
            { "When", new DateTime(2026, 10, 20, 8, 30, 0, DateTimeKind.Utc) },
            { "Oid", ObjectId.GenerateNewId() },
            { "Bin", new BsonBinaryData(new byte[] { 1, 2, 3 }) },
            { "Tags", new BsonArray { "a", "b", 3, BsonNull.Value } },
            {
                "Nested", new BsonDocument
                {
                    { "Deep", new BsonDocument { { "Deeper", new BsonArray { new BsonDocument("x", 1), new BsonDocument() } } } },
                }
            },
        },
        new BsonDocument { { "screening", new string('x', 1_500_000) } },
    };

    [Theory]
    [MemberData(nameof(Documents))]
    public void Of_IsTheEncodedLength(BsonDocument document) =>
        BsonSize.Of(document).Should().Be(document.ToBson().Length);
}
