using System.Collections;
using System.Globalization;
using DataGateway.DomainService.Helpers;
using HotChocolate.Language;
using HotChocolate.Types;
using MongoDB.Bson;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// The <c>GeoJson</c> GraphQL scalar: an RFC 7946 geometry object, carried as
/// a plain object literal.
///
/// Values pass through in the shape they were written — <c>type</c> plus
/// <c>coordinates</c> (or <c>geometries</c>) — which is exactly the shape
/// MongoDB's geospatial operators expect, so Phase 2 can add a 2dsphere index
/// and near/within/intersects without touching stored data.
///
/// Structural validation lives in <see cref="GeoJsonValidator"/> and runs on
/// the write path. This type keeps its own literal check deliberately shallow —
/// "is this an object at all" — because the authoritative, field-named error
/// is raised by <see cref="GraphQlTypeHelper.ParseScalarValueByType"/>, which
/// knows the field name that the spec's message requires and that a scalar,
/// being field-agnostic, cannot know. Validating deeply here as well would
/// mean the caller got a message missing the field name, from whichever of the
/// two happened to run first.
/// </summary>
public sealed class GeoJsonType : ScalarType
{
    public const string TypeName = GeoJsonValidator.TypeName;

    public GeoJsonType() : this(TypeName)
    {
    }

    public GeoJsonType(string name, BindingBehavior bind = BindingBehavior.Implicit)
        : base(name, bind)
    {
        Description =
            "An RFC 7946 GeoJSON geometry object: one of Point, LineString, Polygon, MultiPoint, "
            + "MultiLineString, MultiPolygon or GeometryCollection. Coordinates are [longitude, latitude].";
    }

    public override Type RuntimeType => typeof(object);

    /// <summary>
    /// A geometry is an object, never a list. An array-typed field is
    /// <c>[GeoJson]</c>, and the list is unwrapped before this type ever sees
    /// an element — so accepting a list here would only let one through on a
    /// field declared to hold a single geometry.
    /// </summary>
    public override bool IsInstanceOfType(IValueNode valueSyntax)
    {
        ArgumentNullException.ThrowIfNull(valueSyntax);
        return valueSyntax is ObjectValueNode or NullValueNode;
    }

    public override object? ParseLiteral(IValueNode valueSyntax)
    {
        ArgumentNullException.ThrowIfNull(valueSyntax);

        return valueSyntax switch
        {
            NullValueNode => null,
            ObjectValueNode => valueSyntax.ParseValueNode(),
            _ => throw new SerializationException(
                $"Expected a GeoJson geometry object but found {valueSyntax.Kind}.", this),
        };
    }

    public override IValueNode ParseValue(object? runtimeValue) => ToValueNode(runtimeValue);

    public override IValueNode ParseResult(object? resultValue) => ToValueNode(resultValue);

    public override bool TrySerialize(object? runtimeValue, out object? resultValue)
    {
        // Read path: hand back the stored shape untouched. A document coming
        // from Mongo is normalised to dictionaries/lists so the JSON writer
        // sees plain CLR values rather than BsonDocument.
        resultValue = Normalize(runtimeValue);
        return true;
    }

    public override bool TryDeserialize(object? resultValue, out object? runtimeValue)
    {
        runtimeValue = Normalize(resultValue);
        return true;
    }

    /// <summary>
    /// Converts BSON (read path) and syntax nodes into the plain
    /// dictionary/list/primitive shape everything downstream expects.
    /// </summary>
    private static object? Normalize(object? value)
    {
        switch (value)
        {
            case null:
                return null;
            case BsonDocument document:
                return BsonConversionHelper.BsonDocumentToDictionary(document);
            case BsonValue bson:
                return BsonConversionHelper.BsonValueToObject(bson);
            case IValueNode node:
                return node.ParseValueNode();
            default:
                return value;
        }
    }

    private static IValueNode ToValueNode(object? value)
    {
        switch (Normalize(value))
        {
            case null:
                return NullValueNode.Default;
            case string s:
                return new StringValueNode(s);
            case bool b:
                return new BooleanValueNode(b);
            case int i:
                return new IntValueNode(i);
            case long l:
                return new IntValueNode(l);
            case double d:
                return new FloatValueNode(d);
            case float f:
                return new FloatValueNode(f);
            case decimal m:
                return new FloatValueNode((double)m);
            case IDictionary<string, object?> dictionary:
                return new ObjectValueNode(
                    dictionary.Select(pair => new ObjectFieldNode(pair.Key, ToValueNode(pair.Value))).ToList());
            case IDictionary raw:
                return new ObjectValueNode(RawFields(raw).ToList());
            case IEnumerable items:
                return new ListValueNode(items.Cast<object?>().Select(ToValueNode).ToList());
            default:
                return new StringValueNode(
                    Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty);
        }
    }

    private static IEnumerable<ObjectFieldNode> RawFields(IDictionary raw)
    {
        foreach (DictionaryEntry entry in raw)
        {
            if (entry.Key is string key)
                yield return new ObjectFieldNode(key, ToValueNode(entry.Value));
        }
    }
}
