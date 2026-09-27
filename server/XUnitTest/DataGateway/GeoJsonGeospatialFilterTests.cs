using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// near / within / intersects translation and rejection (SPEC #346 H3-H5, C1-C3).
/// </summary>
public class GeoJsonGeospatialFilterTests
{
    private static SchemaDefinitionExtended StoreSchema() =>
        Schema("Store", "Stores", fields: new() { Field("name"), Field("location", "GeoJson") });

    private static Dictionary<string, object?> Point(double lon, double lat) => new()
    {
        ["type"] = "Point",
        ["coordinates"] = new List<object?> { lon, lat },
    };

    private static Dictionary<string, object?> Square() => new()
    {
        ["type"] = "Polygon",
        ["coordinates"] = new List<object?>
        {
            new List<object?>
            {
                new List<object?> { 8.5, 47.3 }, new List<object?> { 8.6, 47.3 },
                new List<object?> { 8.6, 47.4 }, new List<object?> { 8.5, 47.4 },
                new List<object?> { 8.5, 47.3 },
            },
        },
    };

    private static BsonDocument? Convert(string op, object? operand) =>
        WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?>
            {
                ["location"] = new Dictionary<string, object?> { [op] = operand },
            },
            StoreSchema());

    private static Dictionary<string, object?> Near(double max, double? min = null)
    {
        var near = new Dictionary<string, object?>
        {
            ["geometry"] = Point(8.54, 47.37),
            ["maxDistanceMeters"] = max,
        };
        if (min.HasValue) near["minDistanceMeters"] = min.Value;
        return near;
    }

    [Fact]
    public void Near_BecomesGeoWithinCenterSphereInRadians()
    {
        var result = Convert("near", Near(5000))!;

        var sphere = result["location"]["$geoWithin"]["$centerSphere"].AsBsonArray;
        sphere[0].AsBsonArray.Select(v => v.ToDouble()).Should().Equal(8.54, 47.37);
        sphere[1].ToDouble().Should().BeApproximately(5000d / 6378100d, 1e-12);
        result["location"].AsBsonDocument.Contains("$not").Should().BeFalse();
    }

    [Fact]
    public void Near_WithMinDistance_ExcludesTheInnerCircle()
    {
        var result = Convert("near", Near(10000, 1000))!;

        // Separate clauses: MongoDB rejects $not as a sibling of $geoWithin in one field object.
        var clauses = result["$and"].AsBsonArray;
        clauses[0]["location"]["$geoWithin"]["$centerSphere"][1].ToDouble().Should().BeApproximately(10000d / 6378100d, 1e-12);
        clauses[1]["location"]["$not"]["$geoWithin"]["$centerSphere"][1].ToDouble().Should().BeApproximately(1000d / 6378100d, 1e-12);
    }

    [Fact]
    public void Within_Polygon_BecomesGeoWithinGeometry()
    {
        var result = Convert("within", new Dictionary<string, object?> { ["geometry"] = Square() })!;

        var geometry = result["location"]["$geoWithin"]["$geometry"].AsBsonDocument;
        geometry["type"].AsString.Should().Be("Polygon");
        geometry["coordinates"][0].AsBsonArray.Should().HaveCount(5);
    }

    [Fact]
    public void Intersects_AcceptsAnyGeometry_BecomesGeoIntersects()
    {
        var result = Convert("intersects", new Dictionary<string, object?> { ["geometry"] = Point(8.5, 47.3) })!;

        result["location"]["$geoIntersects"]["$geometry"]["type"].AsString.Should().Be("Point");
    }

    [Fact]
    public void GeospatialOperator_CombinesWithEquality()
    {
        var where = new Dictionary<string, object?>
        {
            ["location"] = new Dictionary<string, object?>
            {
                ["neq"] = Point(1, 1),
                ["intersects"] = new Dictionary<string, object?> { ["geometry"] = Square() },
            },
        };

        var combined = WhereToMongoFilterConverter.Convert(where, StoreSchema())!;

        var clauses = combined["$and"].AsBsonArray;
        clauses[0]["location"].AsBsonDocument.Names.Should().Equal("$ne");
        clauses[1]["location"].AsBsonDocument.Names.Should().Equal("$geoIntersects");
    }

    [Fact]
    public void RuntimeInputObjects_AsHotChocolateBindsThem_Convert()
    {
        // At runtime the operand is the CLR input class with Optional<> members, not a dictionary.
        var input = new GeoJsonOperationFilterInput
        {
            Near = new HotChocolate.Optional<GeoJsonNearInput?>(new GeoJsonNearInput
            {
                Geometry = Point(8.54, 47.37),
                MaxDistanceMeters = 5000,
                MinDistanceMeters = new HotChocolate.Optional<double?>(100),
            }),
            Within = new HotChocolate.Optional<GeoJsonGeometryFilterInput?>(new GeoJsonGeometryFilterInput { Geometry = Square() }),
        };

        var result = WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?> { ["location"] = input }, StoreSchema())!;

        var clauses = result["$and"].AsBsonArray;
        clauses.Should().HaveCount(3);
        clauses[0]["location"]["$geoWithin"]["$centerSphere"][1].ToDouble().Should().BeApproximately(5000d / 6378100d, 1e-12);
        clauses[1]["location"]["$not"]["$geoWithin"]["$centerSphere"][1].ToDouble().Should().BeApproximately(100d / 6378100d, 1e-12);
        clauses[2]["location"]["$geoWithin"]["$geometry"]["type"].AsString.Should().Be("Polygon");
    }

    [Fact]
    public void RuntimeInputObjects_WithOnlyOneOperatorSet_IgnoreTheUnsetOnes()
    {
        var input = new GeoJsonOperationFilterInput
        {
            Intersects = new HotChocolate.Optional<GeoJsonGeometryFilterInput?>(new GeoJsonGeometryFilterInput { Geometry = Square() }),
        };

        var result = WhereToMongoFilterConverter.Convert(
            new Dictionary<string, object?> { ["location"] = input }, StoreSchema())!;

        result["location"].AsBsonDocument.Names.Should().Equal("$geoIntersects");
    }

    // C1 - structurally invalid reference geometry

    [Theory]
    [InlineData("near")]
    [InlineData("within")]
    [InlineData("intersects")]
    public void UnknownReferenceGeometryType_IsRejectedWithTheReason(string op)
    {
        var geometry = new Dictionary<string, object?>
        {
            ["type"] = "Circle",
            ["coordinates"] = new List<object?> { 1.0, 2.0 },
        };
        var operand = op == "near"
            ? new Dictionary<string, object?> { ["geometry"] = geometry, ["maxDistanceMeters"] = 100.0 }
            : new Dictionary<string, object?> { ["geometry"] = geometry };

        var act = () => Convert(op, operand);

        act.Should().Throw<InvalidWhereFilterException>().WithMessage(
            $"GeoJson filter '{op}' requires a valid reference geometry: unknown geometry type 'Circle'");
    }

    [Fact]
    public void OutOfRangeReferenceCoordinate_IsRejected()
    {
        var act = () => Convert("intersects", new Dictionary<string, object?> { ["geometry"] = Point(200, 47) });

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("*longitude 200 is out of range*");
    }

    [Fact]
    public void MissingGeometry_IsRejected()
    {
        var act = () => Convert("intersects", new Dictionary<string, object?> { ["geometry"] = null });

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("*'intersects' requires a valid reference geometry*");
    }

    // C2 - distances

    [Theory]
    [InlineData(-50d)]
    [InlineData(0d)]
    [InlineData(double.NaN)]
    public void Near_NonPositiveMaxDistance_IsRejected(double max)
    {
        var act = () => Convert("near", Near(max));

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("near.maxDistanceMeters must be a positive number");
    }

    [Fact]
    public void Near_MissingMaxDistance_IsRejected()
    {
        var near = Near(1);
        near.Remove("maxDistanceMeters");

        var act = () => Convert("near", near);

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("near.maxDistanceMeters must be a positive number");
    }

    [Fact]
    public void Near_NonPositiveMinDistance_IsRejected()
    {
        var act = () => Convert("near", Near(100, -1));

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("near.minDistanceMeters must be a positive number");
    }

    [Theory]
    [InlineData(100d, 100d)]
    [InlineData(100d, 500d)]
    public void Near_MinNotLessThanMax_IsRejected(double max, double min)
    {
        var act = () => Convert("near", Near(max, min));

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("*minDistanceMeters must be less than*maxDistanceMeters*");
    }

    [Fact]
    public void Near_NonPointReference_IsRejected()
    {
        var operand = new Dictionary<string, object?> { ["geometry"] = Square(), ["maxDistanceMeters"] = 10.0 };

        var act = () => Convert("near", operand);

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("*'near' requires a Point*");
    }

    // C3 - within needs an area to be inside of

    [Theory]
    [InlineData("Point")]
    [InlineData("LineString")]
    public void Within_NonPolygonalReference_IsRejectedNotPassedToMongo(string type)
    {
        var geometry = type == "Point"
            ? Point(8.5, 47.3)
            : new Dictionary<string, object?>
            {
                ["type"] = "LineString",
                ["coordinates"] = new List<object?>
                {
                    new List<object?> { 8.5, 47.3 }, new List<object?> { 8.6, 47.4 },
                },
            };

        var act = () => Convert("within", new Dictionary<string, object?> { ["geometry"] = geometry });

        act.Should().Throw<InvalidWhereFilterException>().WithMessage($"*'within' requires a Polygon or MultiPolygon, not '{type}'*");
    }

    [Fact]
    public void NearAndWithinOnOneField_AreBothApplied()
    {
        var where = new Dictionary<string, object?>
        {
            ["location"] = new Dictionary<string, object?>
            {
                ["near"] = Near(100),
                ["within"] = new Dictionary<string, object?> { ["geometry"] = Square() },
            },
        };

        var result = WhereToMongoFilterConverter.Convert(where, StoreSchema())!;

        var clauses = result["$and"].AsBsonArray;
        clauses.Should().HaveCount(2);
        clauses[0]["location"]["$geoWithin"].AsBsonDocument.Contains("$centerSphere").Should().BeTrue();
        clauses[1]["location"]["$geoWithin"].AsBsonDocument.Contains("$geometry").Should().BeTrue();
    }

    [Fact]
    public void GeospatialOperator_IsNotAllowedOnOtherTypes()
    {
        var schema = Schema("Store", "Stores", fields: new() { Field("name") });
        var where = new Dictionary<string, object?>
        {
            ["name"] = new Dictionary<string, object?> { ["near"] = Near(1) },
        };

        var act = () => WhereToMongoFilterConverter.Convert(where, schema);

        act.Should().Throw<InvalidWhereFilterException>().WithMessage("*Unsupported or invalid operator*");
    }
}
