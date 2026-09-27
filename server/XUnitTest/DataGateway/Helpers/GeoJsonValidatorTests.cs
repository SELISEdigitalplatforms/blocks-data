using DataGateway.DomainService.Helpers;
using FluentAssertions;

namespace XUnitTest.DataGateway.Helpers;

/// <summary>
/// Structural validation of GeoJson values (SPEC #345 H2, C1, C2, C3, C5).
///
/// Values are written in the shape <c>ParseValueNode</c> produces — nested
/// dictionaries and lists — because that is exactly what the mutation path
/// hands the validator.
/// </summary>
public class GeoJsonValidatorTests
{
    private static Dictionary<string, object?> Geometry(string type, object? coordinates) =>
        new() { ["type"] = type, ["coordinates"] = coordinates };

    private static List<object?> Position(double longitude, double latitude) => [longitude, latitude];

    private static void ShouldReject(object? value, string expectedReason) =>
        FluentActions.Invoking(() => GeoJsonValidator.Validate(value))
            .Should().Throw<GeoJsonValidationException>()
            .Which.Reason.Should().Be(expectedReason);

    private static void ShouldAccept(object? value) =>
        FluentActions.Invoking(() => GeoJsonValidator.Validate(value)).Should().NotThrow();

    // ── H2: every one of the seven bare geometry types is accepted ──────────

    [Fact]
    public void Point_IsAccepted() =>
        ShouldAccept(Geometry("Point", Position(8.5417, 47.3769)));

    [Fact]
    public void LineString_IsAccepted() =>
        ShouldAccept(Geometry("LineString", new List<object?>
        {
            Position(8.5, 47.3), Position(8.6, 47.4),
        }));

    [Fact]
    public void Polygon_IsAccepted() =>
        ShouldAccept(Geometry("Polygon", new List<object?>
        {
            new List<object?> { Position(0, 0), Position(1, 0), Position(1, 1), Position(0, 0) },
        }));

    [Fact]
    public void MultiPoint_IsAccepted() =>
        ShouldAccept(Geometry("MultiPoint", new List<object?> { Position(1, 1), Position(2, 2) }));

    [Fact]
    public void MultiLineString_IsAccepted() =>
        ShouldAccept(Geometry("MultiLineString", new List<object?>
        {
            new List<object?> { Position(0, 0), Position(1, 1) },
        }));

    [Fact]
    public void MultiPolygon_IsAccepted() =>
        ShouldAccept(Geometry("MultiPolygon", new List<object?>
        {
            new List<object?>
            {
                new List<object?> { Position(0, 0), Position(1, 0), Position(1, 1), Position(0, 0) },
            },
        }));

    [Fact]
    public void GeometryCollection_IsAccepted() =>
        ShouldAccept(new Dictionary<string, object?>
        {
            ["type"] = "GeometryCollection",
            ["geometries"] = new List<object?>
            {
                Geometry("Point", Position(1, 1)),
                Geometry("LineString", new List<object?> { Position(0, 0), Position(1, 1) }),
            },
        });

    // Integer literals arrive as int, not double, straight off an IntValueNode.
    [Fact]
    public void IntegerCoordinates_AreAccepted() =>
        ShouldAccept(Geometry("Point", new List<object?> { 8, 47 }));

    // RFC 7946 §3.1.1 allows an optional third element.
    [Fact]
    public void PositionWithAltitude_IsAccepted() =>
        ShouldAccept(Geometry("Point", new List<object?> { 8.5, 47.3, 400.0 }));

    // A5/A6: bbox rides along unvalidated rather than being rejected.
    [Fact]
    public void BboxMember_IsPassedThrough()
    {
        var geometry = Geometry("Point", Position(8.5, 47.3));
        geometry["bbox"] = new List<object?> { -180, -90, 180, 90 };
        ShouldAccept(geometry);
    }

    // ── H4: an array-typed field validates every element ────────────────────

    [Fact]
    public void ArrayOfGeometries_IsAccepted() =>
        ShouldAccept(new List<object?>
        {
            Geometry("Point", Position(8.5, 47.3)),
            Geometry("Point", Position(8.6, 47.4)),
        });

    [Fact]
    public void ArrayWithOneBadElement_IsRejected() =>
        ShouldReject(
            new List<object?>
            {
                Geometry("Point", Position(8.5, 47.3)),
                Geometry("Circle", Position(1, 1)),
            },
            "unknown geometry type 'Circle'");

    // ── C5: null is not validated ───────────────────────────────────────────

    [Fact]
    public void Null_IsAccepted() => ShouldAccept(null);

    // ── C1: unrecognised type member ────────────────────────────────────────

    [Fact]
    public void UnknownType_IsRejected() =>
        ShouldReject(Geometry("Circle", Position(1, 2)), "unknown geometry type 'Circle'");

    // Feature/FeatureCollection wrappers are out of scope, and fail as what
    // they are: types this scalar does not recognise.
    [Theory]
    [InlineData("Feature")]
    [InlineData("FeatureCollection")]
    [InlineData("point")]
    public void UnsupportedOrMiscasedType_IsRejected(string type) =>
        ShouldReject(Geometry(type, Position(1, 2)), $"unknown geometry type '{type}'");

    [Fact]
    public void MissingTypeMember_IsRejected() =>
        ShouldReject(
            new Dictionary<string, object?> { ["coordinates"] = Position(1, 2) },
            "unknown geometry type ''");

    [Fact]
    public void NonObjectValue_IsRejected() =>
        ShouldReject("not a geometry", "unknown geometry type ''");

    // ── C2: coordinates nesting does not match the declared type ────────────

    [Fact]
    public void PointWithNestedCoordinates_IsRejected() =>
        ShouldReject(
            Geometry("Point", new List<object?> { Position(8.5, 47.3) }),
            "coordinates must be an array of [longitude, latitude] pairs matching type 'Point'");

    [Fact]
    public void PolygonWithPointCoordinates_IsRejected() =>
        ShouldReject(
            Geometry("Polygon", Position(8.5, 47.3)),
            "coordinates must be an array of [longitude, latitude] pairs matching type 'Polygon'");

    [Fact]
    public void MissingCoordinates_IsRejected() =>
        ShouldReject(
            new Dictionary<string, object?> { ["type"] = "Point" },
            "coordinates must be an array of [longitude, latitude] pairs matching type 'Point'");

    [Fact]
    public void PositionWithOneNumber_IsRejected() =>
        ShouldReject(
            Geometry("Point", new List<object?> { 8.5 }),
            "coordinates must be an array of [longitude, latitude] pairs matching type 'Point'");

    [Fact]
    public void NonNumericCoordinate_IsRejected() =>
        ShouldReject(
            Geometry("Point", new List<object?> { "eight", 47.3 }),
            "coordinates must be an array of [longitude, latitude] pairs matching type 'Point'");

    // An empty ring cannot describe the geometry its type claims.
    [Fact]
    public void EmptyCoordinateList_IsRejected() =>
        ShouldReject(
            Geometry("LineString", new List<object?>()),
            "coordinates must be an array of [longitude, latitude] pairs matching type 'LineString'");

    [Fact]
    public void GeometryCollectionWithoutGeometries_IsRejected() =>
        ShouldReject(
            new Dictionary<string, object?> { ["type"] = "GeometryCollection" },
            "coordinates must be an array of [longitude, latitude] pairs matching type 'GeometryCollection'");

    // The reason names the member geometry, not the collection wrapping it.
    [Fact]
    public void GeometryCollectionWithBadMember_IsRejectedNamingTheMember() =>
        ShouldReject(
            new Dictionary<string, object?>
            {
                ["type"] = "GeometryCollection",
                ["geometries"] = new List<object?> { Geometry("Circle", Position(1, 1)) },
            },
            "unknown geometry type 'Circle'");

    // ── C3: coordinate range ────────────────────────────────────────────────

    [Theory]
    [InlineData(200d)]
    [InlineData(-180.5d)]
    public void LongitudeOutOfRange_IsRejected(double longitude) =>
        ShouldReject(
            Geometry("Point", new List<object?> { longitude, 47.3769 }),
            $"longitude {longitude.ToString("0.############", System.Globalization.CultureInfo.InvariantCulture)} is out of range [-180, 180]");

    [Theory]
    [InlineData(91d)]
    [InlineData(-90.5d)]
    public void LatitudeOutOfRange_IsRejected(double latitude) =>
        ShouldReject(
            Geometry("Point", new List<object?> { 8.5417, latitude }),
            $"latitude {latitude.ToString("0.############", System.Globalization.CultureInfo.InvariantCulture)} is out of range [-90, 90]");

    // The bounds themselves are valid — the antimeridian and the poles exist.
    [Theory]
    [InlineData(180d, 90d)]
    [InlineData(-180d, -90d)]
    public void CoordinatesAtTheBounds_AreAccepted(double longitude, double latitude) =>
        ShouldAccept(Geometry("Point", new List<object?> { longitude, latitude }));

    // Range is checked wherever a position appears, not just at the top level.
    [Fact]
    public void OutOfRangeInsideAPolygonRing_IsRejected() =>
        ShouldReject(
            Geometry("Polygon", new List<object?>
            {
                new List<object?> { Position(0, 0), Position(1, 0), Position(181, 1), Position(0, 0) },
            }),
            "longitude 181 is out of range [-180, 180]");

    // ── The field-named sentence the GraphQL layer reports ──────────────────

    [Fact]
    public void FieldMessage_NamesTheField()
    {
        var exception = new GeoJsonValidationException("unknown geometry type 'Circle'");

        exception.ToFieldMessage("location").Should()
            .Be("Invalid GeoJson value for field 'location': unknown geometry type 'Circle'");
        exception.ToFieldMessage(null).Should()
            .Be("Invalid GeoJson value: unknown geometry type 'Circle'");
    }
}
