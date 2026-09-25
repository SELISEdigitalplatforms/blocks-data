using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// near / within / intersects against a real (ephemeral) MongoDB with the 2dsphere indexes the
/// schema service creates (SPEC #346 H1, H3-H5, C5, C7). A mock cannot prove that Mongo actually
/// accepts the generated filter, including in the count query every result page also runs.
/// </summary>
[Collection("Mongo")]
public class GeoJsonGeospatialMongoTests
{
    private const string Stores = "Stores";
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    public GeoJsonGeospatialMongoTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);
        _repository = new DbRepository(contextProvider.Object, new Mock<IBlocksSecret>().Object);
    }

    private static SchemaDefinitionExtended StoreSchema() => Schema("Store", Stores, fields: new()
    {
        Field("name"),
        Field("location", "GeoJson"),
        Field("waypoints", "GeoJson", isArray: true),
    });

    private static BsonDocument PointDoc(double lon, double lat) =>
        new() { { "type", "Point" }, { "coordinates", new BsonArray { lon, lat } } };

    /// <summary>HQ in Zurich, "Near" about 3 km east of it, "Far" about 40 km away.</summary>
    private async Task SeedAsync()
    {
        await _repository.CreateGeoIndexAsync(Stores, "location", "location_2dsphere");
        // No index on "waypoints": MongoDB cannot build one over an array of GeoJSON objects, so
        // the schema service does not create one for array fields (see the test below).

        await _db.GetCollection<BsonDocument>(Stores).InsertManyAsync(new[]
        {
            new BsonDocument { { "name", "HQ" }, { "location", PointDoc(8.5417, 47.3769) } },
            new BsonDocument { { "name", "Near" }, { "location", PointDoc(8.5817, 47.3769) } },
            new BsonDocument { { "name", "Far" }, { "location", PointDoc(8.3093, 47.0502) } },
            new BsonDocument { { "name", "NoLocation" } },
            new BsonDocument
            {
                { "name", "Trip" },
                { "waypoints", new BsonArray { PointDoc(8.5417, 47.3769), PointDoc(2.3522, 48.8566) } },
            },
        });
    }

    private async Task<(List<string> Names, long Count)> QueryAsync(string field, string op, object operand)
    {
        var filter = WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?>
            {
                [field] = new Dictionary<string, object?> { [op] = operand },
            },
            StoreSchema())!;

        var (items, count) = await _repository.GetItemsWithCountAsync(Stores, filter, null, null, 0, 10);
        return (items.Select(d => d["name"].AsString).OrderBy(n => n).ToList(), count);
    }

    private static Dictionary<string, object?> Point(double lon, double lat) => new()
    {
        ["type"] = "Point",
        ["coordinates"] = new List<object?> { lon, lat },
    };

    private static Dictionary<string, object?> NearOperand(double lon, double lat, double max, double? min = null)
    {
        var operand = new Dictionary<string, object?> { ["geometry"] = Point(lon, lat), ["maxDistanceMeters"] = max };
        if (min.HasValue) operand["minDistanceMeters"] = min.Value;
        return operand;
    }

    private static Dictionary<string, object?> Polygon(double west, double south, double east, double north) => new()
    {
        ["geometry"] = new Dictionary<string, object?>
        {
            ["type"] = "Polygon",
            ["coordinates"] = new List<object?>
            {
                new List<object?>
                {
                    new List<object?> { west, south }, new List<object?> { east, south },
                    new List<object?> { east, north }, new List<object?> { west, north },
                    new List<object?> { west, south },
                },
            },
        },
    };

    [Fact]
    public async Task CreateGeoIndexAsync_Creates2dsphereIndex_AndIsIdempotent()
    {
        await _repository.CreateGeoIndexAsync(Stores, "location", "location_2dsphere");
        await _repository.CreateGeoIndexAsync(Stores, "location", "location_2dsphere");

        var indexes = await (await _db.GetCollection<BsonDocument>(Stores).Indexes.ListAsync()).ToListAsync();
        indexes.Where(i => i["name"] == "location_2dsphere").Should().ContainSingle()
            .Which["key"]["location"].AsString.Should().Be("2dsphere");
    }

    [Fact]
    public async Task ListIndexNamesAsync_ListsExistingIndexes_AndIsEmptyForAMissingCollection()
    {
        (await _repository.ListIndexNamesAsync("NoSuchCollection")).Should().BeEmpty();

        await _repository.CreateGeoIndexAsync(Stores, "location", "location_2dsphere");

        (await _repository.ListIndexNamesAsync(Stores)).Should().Contain(new[] { "_id_", "location_2dsphere" });
    }

    [Fact]
    public async Task Near_ReturnsOnlyDocumentsWithinTheDistance_AndCountsThem()
    {
        await SeedAsync();

        var (names, count) = await QueryAsync("location", "near", NearOperand(8.5417, 47.3769, 5000));

        names.Should().Equal("HQ", "Near");
        count.Should().Be(2);
    }

    [Fact]
    public async Task Near_WithMinDistance_ExcludesCloserDocuments()
    {
        await SeedAsync();

        var (names, _) = await QueryAsync("location", "near", NearOperand(8.5417, 47.3769, 10000, 1000));

        names.Should().Equal("Near");
    }

    [Fact]
    public async Task Near_NothingInRange_ReturnsEmptyList()
    {
        await SeedAsync();

        var (names, count) = await QueryAsync("location", "near", NearOperand(-70.0, -33.0, 1000));

        names.Should().BeEmpty();
        count.Should().Be(0);
    }

    [Fact]
    public async Task Near_InsideAnOrClause_IsAccepted()
    {
        await SeedAsync();
        var where = new Dictionary<string, object?>
        {
            ["or"] = new List<object?>
            {
                new Dictionary<string, object?>
                {
                    ["location"] = new Dictionary<string, object?> { ["near"] = NearOperand(8.5417, 47.3769, 5000) },
                },
                new Dictionary<string, object?> { ["name"] = new Dictionary<string, object?> { ["eq"] = "Far" } },
            },
        };
        var filter = WhereToMongoFilterConverter.Convert(where, StoreSchema())!;

        var (items, count) = await _repository.GetItemsWithCountAsync(Stores, filter, null, null, 0, 10);

        items.Select(d => d["name"].AsString).Should().BeEquivalentTo("HQ", "Near", "Far");
        count.Should().Be(3);
    }

    [Fact]
    public async Task Within_ReturnsOnlyDocumentsInsideThePolygon()
    {
        await SeedAsync();

        var (names, _) = await QueryAsync("location", "within", Polygon(8.5, 47.3, 8.56, 47.4));

        names.Should().Equal("HQ");
    }

    [Fact]
    public async Task Intersects_ReturnsDocumentsOverlappingTheGeometry()
    {
        await SeedAsync();

        var (names, _) = await QueryAsync("location", "intersects", Polygon(8.5, 47.3, 8.6, 47.4));

        names.Should().Equal("HQ", "Near");
    }

    [Fact]
    public async Task Mongo_RejectsA2dsphereIndexOverAnArrayOfGeoJsonObjects()
    {
        // Pins the reason array fields are not auto-indexed: the index itself builds, but any
        // document holding an array of geometries then fails to insert.
        await _repository.CreateGeoIndexAsync(Stores, "waypoints", "waypoints_2dsphere");

        var insert = async () => await _db.GetCollection<BsonDocument>(Stores).InsertOneAsync(new BsonDocument
        {
            { "waypoints", new BsonArray { PointDoc(8.5417, 47.3769), PointDoc(2.3522, 48.8566) } },
        });

        await insert.Should().ThrowAsync<MongoWriteException>();
    }

    [Fact]
    public async Task Near_OnArrayField_MatchesWhenAnyElementQualifies()
    {
        await SeedAsync();

        var (names, _) = await QueryAsync("waypoints", "near", NearOperand(8.5417, 47.3769, 1000));

        names.Should().Equal("Trip");
    }
}
