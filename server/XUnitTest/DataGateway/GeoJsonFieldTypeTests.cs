using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.GraphTypes;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using HotChocolate.Language;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// GeoJson as a first-class scalar type (SPEC #345 H1, H4, H6, C1-C4).
/// The structural rules themselves live in <c>GeoJsonValidatorTests</c>; this
/// covers the wiring that makes "GeoJson" behave like every other scalar.
/// </summary>
public class GeoJsonFieldTypeTests
{
    private static Dictionary<string, object?> Point(double longitude, double latitude) => new()
    {
        ["type"] = "Point",
        ["coordinates"] = new List<object?> { longitude, latitude },
    };

    // ── H1: recognised everywhere a scalar type name is recognised ──────────

    [Fact]
    public void IsScalar_AcceptsGeoJson() =>
        GraphQlTypeHelper.IsScalar("GeoJson").Should().BeTrue();

    // C4: the recognised set grew by exactly one name.
    [Theory]
    [InlineData("Geojson")]
    [InlineData("geojson")]
    [InlineData("GeoJSON")]
    [InlineData("NotAThing")]
    public void IsScalar_RejectsAnythingElse(string type) =>
        GraphQlTypeHelper.IsScalar(type).Should().BeFalse();

    [Fact]
    public void GetTypeNode_MapsGeoJsonToItsNamedType() =>
        GraphQlTypeHelper.GetTypeNode("GeoJson").Should()
            .BeOfType<NamedTypeNode>().Which.Name.Value.Should().Be("GeoJson");

    // H4: an array field is a list of the same scalar, as for any other type.
    [Fact]
    public void GetTypeNode_WrapsArrayGeoJsonInAList()
    {
        var node = GraphQlTypeHelper.GetTypeNode("GeoJson", isArray: true);

        node.Should().BeOfType<ListTypeNode>()
            .Which.Type.Should().BeOfType<NamedTypeNode>()
            .Which.Name.Value.Should().Be("GeoJson");
    }

    // ── H1 / C4: the field-definition validator ─────────────────────────────

    private static Mock<IDbRepository> RepositoryWithNoSchemas()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), ""))
            .ReturnsAsync((SchemaDefinition?)null);
        return repo;
    }

    [Fact]
    public async Task FieldDefinition_GeoJsonType_IsValidWithoutLookingForADtoSchema()
    {
        var repo = RepositoryWithNoSchemas();
        var validator = new FieldDefinitionRequestValidator(repo.Object);

        var result = await validator.ValidateAsync(
            new FieldDefinitionRequest { Name = "location", Type = "GeoJson" });

        result.IsValid.Should().BeTrue();
        // A known scalar short-circuits before the Dto lookup, exactly as
        // "String" does — GeoJson must not cost a database round trip.
        repo.Verify(
            r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), ""),
            Times.Never);
    }

    // C4: unchanged rejection for a type that is neither scalar nor Dto.
    [Fact]
    public async Task FieldDefinition_UnknownType_StillFails()
    {
        var validator = new FieldDefinitionRequestValidator(RepositoryWithNoSchemas().Object);

        var result = await validator.ValidateAsync(
            new FieldDefinitionRequest { Name = "location", Type = "NotAThing" });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Type");
    }

    // ── C1-C3: the write path reports the failing field by name ─────────────

    private static string ParseFailureMessage(IValueNode literal)
    {
        var geoJsonType = new GeoJsonType();

        var act = () => literal.ParseScalarValueByType(geoJsonType, "location");

        return act.Should().Throw<InvalidCastException>().Which.Message;
    }

    [Fact]
    public void ParseScalarValueByType_UnknownGeometry_NamesFieldAndReason() =>
        ParseFailureMessage(
                new ObjectValueNode(
                    new ObjectFieldNode("type", "Circle"),
                    new ObjectFieldNode("coordinates", new ListValueNode(
                        new IntValueNode(1), new IntValueNode(2)))))
            .Should().Be("Invalid GeoJson value for field 'location': unknown geometry type 'Circle'");

    [Fact]
    public void ParseScalarValueByType_OutOfRangeLongitude_NamesFieldAndReason() =>
        ParseFailureMessage(
                new ObjectValueNode(
                    new ObjectFieldNode("type", "Point"),
                    new ObjectFieldNode("coordinates", new ListValueNode(
                        new IntValueNode(200), new FloatValueNode(47.3769)))))
            .Should().Be(
                "Invalid GeoJson value for field 'location': longitude 200 is out of range [-180, 180]");

    [Fact]
    public void ParseScalarValueByType_ShapeMismatch_NamesFieldAndReason() =>
        ParseFailureMessage(
                new ObjectValueNode(
                    new ObjectFieldNode("type", "Point"),
                    new ObjectFieldNode("coordinates", new ListValueNode(
                        new ListValueNode(new FloatValueNode(8.5), new FloatValueNode(47.3))))))
            .Should().Be(
                "Invalid GeoJson value for field 'location': coordinates must be an array of "
                + "[longitude, latitude] pairs matching type 'Point'");

    // H2/H3: a valid value survives the round trip unchanged.
    [Fact]
    public void ParseScalarValueByType_ValidGeometry_PassesThroughUnchanged()
    {
        var literal = new ObjectValueNode(
            new ObjectFieldNode("type", "Point"),
            new ObjectFieldNode("coordinates", new ListValueNode(
                new FloatValueNode(8.5417), new FloatValueNode(47.3769))));

        var parsed = literal.ParseScalarValueByType(new GeoJsonType(), "location");

        var geometry = parsed.Should().BeAssignableTo<IDictionary<string, object?>>().Subject;
        geometry["type"].Should().Be("Point");
        geometry["coordinates"].Should().BeEquivalentTo(new List<object?> { 8.5417, 47.3769 });
    }

    // C5: an absent value is not validated.
    [Fact]
    public void ParseScalarValueByType_Null_IsNotValidated() =>
        NullValueNode.Default.ParseScalarValueByType(new GeoJsonType(), "location").Should().BeNull();

    // ── The scalar type itself ──────────────────────────────────────────────

    [Fact]
    public void GeoJsonType_IsNamedGeoJson() => new GeoJsonType().Name.Should().Be("GeoJson");

    [Fact]
    public void GeoJsonType_AcceptsObjectAndNullLiterals()
    {
        var type = new GeoJsonType();

        type.IsInstanceOfType(new ObjectValueNode()).Should().BeTrue();
        type.IsInstanceOfType(NullValueNode.Default).Should().BeTrue();
        type.IsInstanceOfType(new StringValueNode("Point")).Should().BeFalse();
        // An array field is [GeoJson]; the list is unwrapped before an element
        // reaches this type, so a list literal on a single-valued field is not
        // a geometry and must not be accepted as one.
        type.IsInstanceOfType(new ListValueNode()).Should().BeFalse();
    }

    // H3: the read path hands back the stored shape, converting out of BSON.
    [Fact]
    public void GeoJsonType_SerializesABsonDocumentBackToPlainValues()
    {
        var stored = new BsonDocument
        {
            { "type", "Point" },
            { "coordinates", new BsonArray { 8.5417, 47.3769 } },
        };

        new GeoJsonType().TrySerialize(stored, out var result).Should().BeTrue();

        var geometry = result.Should().BeAssignableTo<IDictionary<string, object?>>().Subject;
        geometry["type"].Should().Be("Point");
        geometry["coordinates"].Should().BeEquivalentTo(new List<object?> { 8.5417, 47.3769 });
    }

    // ── H6: eq / neq reach Mongo as a whole geometry document ───────────────

    private static SchemaDefinitionExtended StoreSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("location", "GeoJson"),
        Field("waypoints", "GeoJson", isArray: true),
    });

    [Fact]
    public void Convert_GeoJsonEquality_BuildsAGeometryDocument()
    {
        var where = new Dictionary<string, object?>
        {
            ["location"] = new Dictionary<string, object?> { ["eq"] = Point(8.5417, 47.3769) },
        };

        var result = WhereToMongoFilterConverter.Convert(where, StoreSchema());

        // BsonDocument is IEnumerable<BsonElement>, so FluentAssertions would
        // compare it as a collection; Assert.Equal uses its value equality,
        // which is what the rest of this suite relies on too.
        Assert.Equal(
            new BsonDocument("location", new BsonDocument("$eq",
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.5417, 47.3769 } } })),
            result);
    }

    [Fact]
    public void Convert_GeoJsonInequality_BuildsAGeometryDocument()
    {
        var where = new Dictionary<string, object?>
        {
            ["location"] = new Dictionary<string, object?> { ["neq"] = Point(8.5417, 47.3769) },
        };

        var result = WhereToMongoFilterConverter.Convert(where, StoreSchema());

        Assert.Equal(
            new BsonDocument("location", new BsonDocument("$ne",
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.5417, 47.3769 } } })),
            result);
    }

    [Fact]
    public void Convert_ArrayOfGeometries_BuildsABsonArrayOfDocuments()
    {
        var where = new Dictionary<string, object?>
        {
            ["waypoints"] = new Dictionary<string, object?>
            {
                ["eq"] = new List<object?> { Point(8.5, 47.3), Point(8.6, 47.4) },
            },
        };

        var result = WhereToMongoFilterConverter.Convert(where, StoreSchema());

        Assert.Equal(
            new BsonDocument("waypoints", new BsonDocument("$eq", new BsonArray
            {
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.5, 47.3 } } },
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.6, 47.4 } } },
            })),
            result);
    }

    // ── H2 / A3: the stored shape is Mongo's own GeoJSON shape ──────────────

    /// <summary>
    /// <c>MutationService.InputToBsonDocument</c> persists via
    /// <c>BsonValue.Create</c>, so a geometry survives only because the BSON
    /// mapper descends into dictionaries and lists. That is the whole basis of
    /// decision A3 — Phase 2 can add a 2dsphere index with no migration — so
    /// it is pinned rather than assumed.
    /// </summary>
    [Fact]
    public void BsonValueCreate_StoresAGeometryInItsNativeShape()
    {
        var stored = BsonValue.Create(Point(8.5417, 47.3769));

        Assert.Equal(
            new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.5417, 47.3769 } } },
            stored);
    }

    [Fact]
    public void BsonValueCreate_StoresAnArrayOfGeometries()
    {
        var stored = BsonValue.Create(new List<object?> { Point(8.5, 47.3), Point(8.6, 47.4) });

        Assert.Equal(
            new BsonArray
            {
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.5, 47.3 } } },
                new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { 8.6, 47.4 } } },
            },
            stored);
    }

    // ── C6: field-level CLS treats GeoJson like any other field ─────────────

    /// <summary>
    /// CLS works on field paths, not types, so a GeoJson field must be
    /// excluded on exactly the same terms as a String one — no bypass, and no
    /// accidental exemption from a value shaped like an object.
    /// </summary>
    [Fact]
    public void ClsExclusion_TreatsAGeoJsonFieldLikeAStringField()
    {
        var input = new Dictionary<string, object?>
        {
            ["Name"] = "Zurich HQ",
            ["location"] = Point(8.5417, 47.3769),
        };

        var removed = MutationInputHelper.RemoveExcludedPathsFromInput(input, ["location"]);

        removed.Should().BeEquivalentTo(["location"]);
        input.Should().ContainKey("Name").And.NotContainKey("location");
    }

    /// <summary>
    /// A geometry is a dictionary, so path discovery walks into it the same way
    /// it walks into a Dto. The field's own path is what CLS rules are written
    /// against, and it must be present.
    /// </summary>
    [Fact]
    public void ClsPathDiscovery_SeesTheGeoJsonFieldPath()
    {
        var input = new Dictionary<string, object?>
        {
            ["Name"] = "Zurich HQ",
            ["location"] = Point(8.5417, 47.3769),
        };

        var paths = MutationInputHelper.GetAllPathsFromInput(input, string.Empty);

        paths.Should().Contain("location");
    }

    // Phase 2 adds near/within/intersects; until then they are not operators
    // this type accepts, and the converter says so rather than silently
    // building a filter Mongo would reject.
    [Theory]
    [InlineData("near")]
    [InlineData("within")]
    [InlineData("intersects")]
    [InlineData("contains")]
    [InlineData("gt")]
    public void Convert_UnsupportedGeoJsonOperator_IsRejected(string op)
    {
        var where = new Dictionary<string, object?>
        {
            ["location"] = new Dictionary<string, object?> { [op] = Point(8.5, 47.3) },
        };

        FluentActions.Invoking(() => WhereToMongoFilterConverter.Convert(where, StoreSchema()))
            .Should().Throw<Exception>()
            .WithMessage($"*{op}*");
    }
}
