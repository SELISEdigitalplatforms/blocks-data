using System.Collections;
using System.Text;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.Rest.Parsing;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Language;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.Rest.RecordTestEntity;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// A record body read by <see cref="JsonRecordReader"/> must equal, value for value and type for type, what
/// <c>GraphQlTypeHelper.MapMutationInput</c> builds for the equivalent GraphQL literal against the insert input type of
/// a HotChocolate schema built from the same entity definitions. A field set to null is dropped by both. Intentional
/// differences, with no parity case: GraphQL turns a null DTO, or a null item in a list of DTOs, into an empty object;
/// REST drops a null DTO and refuses a null item in a list of DTOs. Also not copied: GraphQL turns an ID field
/// holding a date-like string into a DateTime (a bug of its ID parsing); REST keeps the string
/// (<c>Read_IdFieldDateLikeString_KeptAsString</c>). The comparer checks the CLR type of every value (int vs long vs
/// double, DateTime vs string) and each DateTime's value, which is always UTC on both sides; it does not compare
/// <see cref="DateTimeKind"/>.
/// </summary>
[Collection("Mongo")]
public class RecordParityTests
{
    private static readonly object BuildLock = new();
    private static InputObjectType? _cachedInsertInput;
    private static readonly EntityModel Parcel = Model();
    private readonly InputObjectType _insertInput;

    public RecordParityTests(MongoFixture fixture)
    {
        // One HotChocolate schema for the whole class (see GraphQlTypeHelperMappingTests: rebuilding per test
        // registers global types again and can deadlock against other collections).
        lock (BuildLock)
        {
            if (_cachedInsertInput is null)
            {
                BlocksTestContext.Set();
                var db = fixture.CreateDatabase();
                var provider = new Mock<IDbContextProvider>();
                provider.Setup(p => p.GetDatabase()).Returns(db);
                provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
                provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
                var repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
                repo.InsertManyAsync(Source().SchemaDefinitions).GetAwaiter().GetResult();

                var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
                var builder = new GraphqlSchemaBuilder(resolver, repo, NullLogger<GraphqlSchemaBuilder>.Instance);
                var schemaBuilder = SchemaBuilder.New();
                builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
                _cachedInsertInput = schemaBuilder.Create().GetType<InputObjectType>("ParcelInsertInput");
            }
            _insertInput = _cachedInsertInput;
        }
    }

    /// <summary>Each case: the JSON body and the same record as a GraphQL object literal.</summary>
    private static readonly Dictionary<string, (string Json, string Literal)> Cases = new()
    {
        ["String"] = (
            """{ "Name": "Ann", "Code": "c-1" }""",
            """{ Name: "Ann", Code: "c-1" }"""),

        ["Int"] = (
            """{ "Age": 42 }""",
            "{ Age: 42 }"),

        ["Int negative and limits"] = (
            """{ "Age": -2147483648 }""",
            "{ Age: -2147483648 }"),

        ["Float"] = (
            """{ "Score": 4.5 }""",
            "{ Score: 4.5 }"),

        ["Float written as integer"] = (
            """{ "Score": 2 }""",
            "{ Score: 2 }"),

        ["Boolean"] = (
            """{ "IsActive": true }""",
            "{ IsActive: true }"),

        ["DateTime with offset"] = (
            """{ "Born": "2024-01-01T10:00:00+06:00" }""",
            """{ Born: "2024-01-01T10:00:00+06:00" }"""),

        ["DateTime Z with fraction"] = (
            """{ "Born": "2024-02-29T23:59:59.125Z" }""",
            """{ Born: "2024-02-29T23:59:59.125Z" }"""),

        ["Enum"] = (
            """{ "Status": "Pending" }""",
            "{ Status: Pending }"),

        ["GeoJSON point"] = (
            """{ "Location": { "type": "Point", "coordinates": [90.4, 23.8] } }""",
            """{ Location: { type: "Point", coordinates: [90.4, 23.8] } }"""),

        ["GeoJSON polygon with integer coordinates"] = (
            """{ "Location": { "type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }""",
            """{ Location: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }"""),

        ["GeoJSON array"] = (
            """{ "Zones": [ { "type": "Point", "coordinates": [1, 2] }, { "type": "LineString", "coordinates": [[1, 2], [3.5, 4]] } ] }""",
            """{ Zones: [ { type: "Point", coordinates: [1, 2] }, { type: "LineString", coordinates: [[1, 2], [3.5, 4]] } ] }"""),

        ["DTO"] = (
            """{ "Ship": { "Street": "1 Main", "City": "Dhaka", "Zip": 1000 } }""",
            """{ Ship: { Street: "1 Main", City: "Dhaka", Zip: 1000 } }"""),

        ["DTO nested in DTO"] = (
            """{ "Billing": { "City": "c", "Detail": { "Sku": "s", "Qty": 3, "Price": 9.5 } } }""",
            """{ Billing: { City: "c", Detail: { Sku: "s", Qty: 3, Price: 9.5 } } }"""),

        ["DTO field named ItemId, renamed at every level"] = (
            """{ "Lines": [ { "ItemId": "l-1", "Sku": "a" } ], "Billing": { "Detail": { "ItemId": "d-1", "Qty": 2 } } }""",
            """{ Lines: [ { ItemId: "l-1", Sku: "a" } ], Billing: { Detail: { ItemId: "d-1", Qty: 2 } } }"""),

        ["DTO field the inline rows lack"] = (
            """{ "Ship": { "Street": "s", "Detail": { "Sku": "x", "Price": 1.5 } } }""",
            """{ Ship: { Street: "s", Detail: { Sku: "x", Price: 1.5 } } }"""),

        ["empty DTO"] = (
            """{ "Ship": {} }""",
            "{ Ship: {} }"),

        ["array of strings"] = (
            """{ "Nicknames": ["a", "b"], "Tags": ["x"] }""",
            """{ Nicknames: ["a", "b"], Tags: ["x"] }"""),

        ["array of floats"] = (
            """{ "Scores": [1, 2.5, 3] }""",
            "{ Scores: [1, 2.5, 3] }"),

        ["array of enums"] = (
            """{ "Levels": ["Low", "High"] }""",
            "{ Levels: [Low, High] }"),

        ["empty arrays"] = (
            """{ "Nicknames": [], "Lines": [], "Zones": [] }""",
            "{ Nicknames: [], Lines: [], Zones: [] }"),

        ["string array with a null item"] = (
            """{ "Nicknames": ["a", null] }""",
            """{ Nicknames: ["a", null] }"""),

        ["array of DTOs"] = (
            """{ "Lines": [ { "Sku": "a", "Qty": 2 }, { "Sku": "b", "Price": 1.5 }, {} ] }""",
            """{ Lines: [ { Sku: "a", Qty: 2 }, { Sku: "b", Price: 1.5 }, {} ] }"""),

        ["null fields"] = (
            """{ "Name": null, "Age": null, "Nicknames": null, "Location": null, "Born": null }""",
            "{ Name: null, Age: null, Nicknames: null, Location: null, Born: null }"),

        ["null mixed with values"] = (
            """{ "Name": "Ann", "Age": null, "Ship": { "Street": null, "City": "Dhaka" } }""",
            """{ Name: "Ann", Age: null, Ship: { Street: null, City: "Dhaka" } }"""),

        ["ItemId"] = (
            """{ "ItemId": "parcel-1", "Name": "Ann" }""",
            """{ ItemId: "parcel-1", Name: "Ann" }"""),

        ["every field type together"] = (
            """
            {
              "ItemId": "p-9", "Tags": ["t1", "t2"], "Code": "c", "Name": "Ann", "Age": 7, "Score": 0.25, "IsActive": false,
              "Born": "2023-12-31T23:30:00-02:00", "Status": "Closed", "Levels": ["High"],
              "Location": { "type": "Point", "coordinates": [1.5, 2] },
              "Zones": [ { "type": "Point", "coordinates": [0, 0] } ],
              "Nicknames": ["n"], "Scores": [1],
              "Ship": { "Street": "s", "Zip": 5 },
              "Billing": { "City": "b", "Detail": { "Sku": "d" } },
              "Lines": [ { "Sku": "l", "Qty": 1, "Price": 2 } ]
            }
            """,
            """
            {
              ItemId: "p-9", Tags: ["t1", "t2"], Code: "c", Name: "Ann", Age: 7, Score: 0.25, IsActive: false,
              Born: "2023-12-31T23:30:00-02:00", Status: Closed, Levels: [High],
              Location: { type: "Point", coordinates: [1.5, 2] },
              Zones: [ { type: "Point", coordinates: [0, 0] } ],
              Nicknames: ["n"], Scores: [1],
              Ship: { Street: "s", Zip: 5 },
              Billing: { City: "b", Detail: { Sku: "d" } },
              Lines: [ { Sku: "l", Qty: 1, Price: 2 } ]
            }
            """),
    };

    public static TheoryData<string> CaseNames => new(Cases.Keys);

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void RecordParity_SameInput_SameDictionary(string name)
    {
        var (json, literal) = Cases[name];

        var rest = JsonRecordReader.Read(Json(json), Parcel, WriteOperation.Insert);
        var literalNode = (ObjectValueNode)Utf8GraphQLParser.Syntax.ParseValueLiteral(literal, false);
        var graphQl = new Dictionary<string, object?>().MapMutationInput(literalNode, _insertInput);

        var differences = new List<string>();
        Compare(graphQl, rest, "$", differences);
        differences.Should().BeEmpty($"REST and GraphQL must build the same record for '{name}'");
    }

    [Fact]
    public void RecordParity_BulkInput_SameDictionaries()
    {
        var records = Cases.Values.Select(c => c.Json).Where(j => !j.Contains("null")).Take(6).ToList();
        var literals = Cases.Where(c => records.Contains(c.Value.Json)).Select(c => c.Value.Literal).ToList();

        var rest = JsonRecordReader.ReadMany(Json($"[{string.Join(",", records)}]"), Parcel, 100);
        var graphQl = GraphQlTypeHelper.MapBulkMutationInput((ListValueNode)Utf8GraphQLParser.Syntax.ParseValueLiteral($"[{string.Join(",", literals)}]", false), _insertInput);

        var differences = new List<string>();
        Compare(graphQl.Cast<object?>().ToList(), rest.Cast<object?>().ToList(), "$", differences);
        differences.Should().BeEmpty();
    }

    // ---- typed deep comparison ----

    /// <summary>
    /// Appends one line per difference: a missing or extra key, a different CLR type (int vs long vs double matter),
    /// a different value, a different list length.
    /// </summary>
    private static void Compare(object? expected, object? actual, string path, List<string> differences)
    {
        if (expected is null || actual is null)
        {
            if (!ReferenceEquals(expected, actual))
                differences.Add($"{path}: expected {Describe(expected)} but was {Describe(actual)}");
            return;
        }

        if (expected.GetType() != actual.GetType())
        {
            differences.Add($"{path}: expected type {expected.GetType().Name} ({Describe(expected)}) but was {actual.GetType().Name} ({Describe(actual)})");
            return;
        }

        switch (expected)
        {
            case IDictionary<string, object?> left:
                var right = (IDictionary<string, object?>)actual;
                foreach (var key in left.Keys.Except(right.Keys))
                    differences.Add($"{path}.{key}: missing");
                foreach (var key in right.Keys.Except(left.Keys))
                    differences.Add($"{path}.{key}: unexpected");
                foreach (var key in left.Keys.Intersect(right.Keys))
                    Compare(left[key], right[key], $"{path}.{key}", differences);
                break;
            case IList leftList:
                var rightList = (IList)actual;
                if (leftList.Count != rightList.Count)
                {
                    differences.Add($"{path}: expected {leftList.Count} items but was {rightList.Count}");
                    break;
                }
                for (var i = 0; i < leftList.Count; i++)
                    Compare(leftList[i], rightList[i], $"{path}[{i}]", differences);
                break;
            default:
                if (!expected.Equals(actual))
                    differences.Add($"{path}: expected {Describe(expected)} but was {Describe(actual)}");
                break;
        }
    }

    private static string Describe(object? value) => value switch
    {
        null => "null",
        DateTime date => $"{date:O} ({date.Kind})",
        _ => value.ToString() ?? string.Empty
    };

    [Fact]
    public void Comparison_Itself_NoticesTypeAndValueDifferences()
    {
        var differences = new List<string>();

        Compare(new Dictionary<string, object?> { ["a"] = 1, ["b"] = new List<object?> { 1.0 }, ["c"] = "x" },
            new Dictionary<string, object?> { ["a"] = 1L, ["b"] = new List<object?> { 1 }, ["d"] = "x" }, "$", differences);

        differences.Should().HaveCount(4);
    }
}
