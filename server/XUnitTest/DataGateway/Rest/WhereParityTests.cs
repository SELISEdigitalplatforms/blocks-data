using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.Rest;
using DataGateway.Rest.Parsing;
using MongoDB.Bson;
using static XUnitTest.DataGateway.Rest.RestTestEntity;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// The REST where reader and the GraphQL argument normaliser must hand the converter trees that become the same
/// MongoDB filter. The GraphQL side is built from the CLR input objects HotChocolate binds a where argument to.
/// </summary>
public class WhereParityTests
{
    private static Dictionary<string, object?> Filter(params (string Key, object? Value)[] entries)
        => entries.ToDictionary(e => e.Key, e => e.Value);

    private static Dictionary<string, object?> Geometry(string type, object coordinates)
        => new() { ["type"] = type, ["coordinates"] = coordinates };

    private static List<object?> L(params object?[] items) => [.. items];

    private static readonly Dictionary<string, (string Json, Func<object> GraphQL)> Cases = new()
    {
        // One regex operator per field: contains/startsWith/endsWith all become $regex, and the converter cannot put
        // two of them on one field (for GraphQL either). REST refuses two up front (R8).
        ["string operators"] = (
            """{ "Name": { "neq": "x", "contains": "jo" }, "Email": { "startsWith": "a" } }""",
            () => Filter(
                ("Name", new StringOperationFilterInput { Neq = "x", Contains = "jo" }),
                ("Email", new StringOperationFilterInput { StartsWith = "a" }))),

        ["string in and id"] = (
            """{ "Name": { "in": ["a", "b"] }, "ItemId": { "eq": "id-1" }, "Email": { "endsWith": "@x.com" } }""",
            () => Filter(
                ("Name", new StringOperationFilterInput { In = L("a", "b") }),
                ("ItemId", new StringOperationFilterInput { Eq = "id-1" }),
                ("Email", new StringOperationFilterInput { EndsWith = "@x.com" }))),

        ["number ranges"] = (
            """{ "Age": { "gte": 18, "lt": 65 }, "Score": { "gt": 1.5, "lte": 9 } }""",
            () => Filter(
                ("Age", new IntOperationFilterInput { Gte = 18, Lt = 65 }),
                ("Score", new NumberOperationFilterInput { Gt = 1.5, Lte = 9d }))),

        ["number in and boolean"] = (
            """{ "Age": { "in": [1, 2, 3] }, "Score": { "in": [0.5, 2] }, "IsActive": { "eq": true, "neq": false } }""",
            () => Filter(
                ("Age", new IntOperationFilterInput { In = L(1, 2, 3) }),
                ("Score", new NumberOperationFilterInput { In = L(0.5, 2d) }),
                ("IsActive", new BooleanOperationFilterInput { Eq = true, Neq = false }))),

        ["datetime"] = (
            """{ "CreatedDate": { "gte": "2024-01-01T00:00:00Z", "lt": "2024-02-01T12:30:00+02:00" } }""",
            () => Filter(
                ("CreatedDate", new DateTimeOperationFilterInput
                {
                    Gte = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    Lt = new DateTime(2024, 2, 1, 10, 30, 0, DateTimeKind.Utc)
                }))),

        ["enum in"] = (
            """{ "Status": { "neq": "Closed", "in": ["Open", "Pending"] } }""",
            () => Filter(("Status", new EnumOperationFilterInput { Neq = "Closed", In = L("Open", "Pending") }))),

        ["enum nin"] = (
            """{ "Status": { "eq": "Open", "nin": ["Closed"] } }""",
            () => Filter(("Status", new EnumOperationFilterInput { Eq = "Open", Nin = L("Closed") }))),

        ["nested dto path"] = (
            """{ "Ship": { "City": { "eq": "Dhaka" }, "Zip": { "gte": 1000 } }, "Name": { "eq": "a" } }""",
            () => Filter(
                ("Ship", Filter(
                    ("City", new StringOperationFilterInput { Eq = "Dhaka" }),
                    ("Zip", new IntOperationFilterInput { Gte = 1000 }))),
                ("Name", new StringOperationFilterInput { Eq = "a" }))),

        ["and/or nesting"] = (
            """
            {
              "or": [
                { "Name": { "eq": "a" } },
                { "and": [ { "Age": { "gt": 1 } }, { "IsActive": { "eq": false } } ] }
              ],
              "and": [ { "Ship": { "City": { "contains": "dh" } } } ],
              "Email": { "contains": "x" }
            }
            """,
            () => Filter(
                ("or", L(
                    Filter(("Name", new StringOperationFilterInput { Eq = "a" })),
                    Filter(("and", L(
                        Filter(("Age", new IntOperationFilterInput { Gt = 1 })),
                        Filter(("IsActive", new BooleanOperationFilterInput { Eq = false }))))))),
                ("and", L(Filter(("Ship", Filter(("City", new StringOperationFilterInput { Contains = "dh" })))))),
                ("Email", new StringOperationFilterInput { Contains = "x" }))),

        ["geo near"] = (
            """
            { "Location": { "near": {
                "geometry": { "type": "Point", "coordinates": [90.4, 23.8] },
                "maxDistanceMeters": 500, "minDistanceMeters": 10.5 } } }
            """,
            () => Filter(("Location", new GeoJsonOperationFilterInput
            {
                Near = new GeoJsonNearInput
                {
                    Geometry = Geometry("Point", L(90.4, 23.8)),
                    MaxDistanceMeters = 500,
                    MinDistanceMeters = 10.5
                }
            }))),

        ["geo within"] = (
            """
            { "Location": { "within": { "geometry": { "type": "Polygon",
                "coordinates": [[[90.1, 23.1], [90.9, 23.1], [90.9, 23.9], [90.1, 23.1]]] } } } }
            """,
            () => Filter(("Location", new GeoJsonOperationFilterInput
            {
                Within = new GeoJsonGeometryFilterInput
                {
                    Geometry = Geometry("Polygon", L(L(L(90.1, 23.1), L(90.9, 23.1), L(90.9, 23.9), L(90.1, 23.1))))
                }
            }))),

        ["geo intersects and eq"] = (
            """
            { "Location": {
                "eq": { "type": "Point", "coordinates": [1.5, 2.5] },
                "intersects": { "geometry": { "type": "LineString", "coordinates": [[1.5, 2.5], [3.5, 4.5]] } } } }
            """,
            () => Filter(("Location", new GeoJsonOperationFilterInput
            {
                Eq = Geometry("Point", L(1.5, 2.5)),
                Intersects = new GeoJsonGeometryFilterInput { Geometry = Geometry("LineString", L(L(1.5, 2.5), L(3.5, 4.5))) }
            }))),
    };

    public static TheoryData<string> CaseNames => [.. Cases.Keys];

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void WhereParity_SameFilter_SameMongoDocument(string name)
    {
        var (json, graphQL) = Cases[name];
        var entity = Order();

        var fromGraphQL = GraphQLArgumentNormalizer.ConvertWhere(graphQL(), entity.Schema);
        var fromRest = WhereToMongoFilterConverter.Convert(JsonWhereReader.Read(Json(json), entity, new RestLimits()), entity.Schema);

        Assert.NotNull(fromGraphQL);
        Assert.Equal(fromGraphQL, fromRest);
    }

    /// <summary>
    /// DateTime <c>in</c>: REST builds the list of UTC dates Mongo stores. The GraphQL side matches it when its items
    /// are <see cref="DateTime"/>s. HotChocolate hands the untyped <c>In</c> list over as <see cref="DateTimeOffset"/>
    /// items, which the converter cannot map to BSON (<c>ArgumentException</c>); that GraphQL path is left as it is,
    /// so this case pins REST's document instead of comparing with it.
    /// </summary>
    [Fact]
    public void WhereParity_DateTimeIn_RestBuildsUtcDateList()
    {
        var entity = Order();
        var first = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var second = new DateTime(2024, 2, 1, 10, 30, 0, DateTimeKind.Utc);
        var expected = new BsonDocument("CreatedDate",
            new BsonDocument("$in", new BsonArray { new BsonDateTime(first), new BsonDateTime(second) }));

        var fromRest = WhereToMongoFilterConverter.Convert(
            JsonWhereReader.Read(Json("""{ "CreatedDate": { "in": ["2024-01-01T00:00:00Z", "2024-02-01T12:30:00+02:00"] } }"""),
                entity, new RestLimits()),
            entity.Schema);
        var fromGraphQLDateTimes = GraphQLArgumentNormalizer.ConvertWhere(
            Filter(("CreatedDate", new DateTimeOperationFilterInput { In = L(first, second) })), entity.Schema);

        Assert.Equal(expected, fromRest);
        Assert.Equal(expected, fromGraphQLDateTimes);
    }
}
