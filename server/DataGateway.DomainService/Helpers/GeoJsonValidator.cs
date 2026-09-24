using System.Collections;
using System.Globalization;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Raised when a value declared as <c>GeoJson</c> is not a structurally valid
/// RFC 7946 geometry. Carries only the reason; callers that know which field
/// the value belongs to wrap it in the user-facing sentence.
/// </summary>
public sealed class GeoJsonValidationException(string reason) : Exception(reason)
{
    /// <summary>The bare reason, e.g. <c>unknown geometry type 'Circle'</c>.</summary>
    public string Reason { get; } = reason;

    /// <summary>The message shape the GraphQL layer reports for a named field.</summary>
    public string ToFieldMessage(string? fieldName) =>
        string.IsNullOrEmpty(fieldName)
            ? $"Invalid GeoJson value: {Reason}"
            : $"Invalid GeoJson value for field '{fieldName}': {Reason}";
}

/// <summary>
/// Structural validation for GeoJSON geometry values (RFC 7946 §3.1).
///
/// Deliberately structural only — it checks the <c>type</c> member against the
/// seven bare geometry types, that <c>coordinates</c> nests to the depth that
/// type implies, and that every coordinate pair is a plausible
/// longitude/latitude. It does not check geometric validity (ring closure,
/// winding order, self-intersection): those are out of scope, and rejecting
/// otherwise well-formed third-party GeoJSON over them would cost more than it
/// buys.
///
/// <c>Feature</c>/<c>FeatureCollection</c> wrappers are not accepted; they fail
/// as unknown geometry types, which is the intended behaviour.
///
/// The value shape is whatever <see cref="GraphQlTypeHelper.ParseValueNode"/>
/// produces — nested <see cref="IDictionary{TKey,TValue}"/> and
/// <see cref="IList"/> — so this stays free of any GraphQL or BSON dependency
/// and is directly unit-testable.
/// </summary>
public static class GeoJsonValidator
{
    /// <summary>The schema type-name that selects this validation.</summary>
    public const string TypeName = "GeoJson";

    private const string TypeMember = "type";
    private const string CoordinatesMember = "coordinates";
    private const string GeometriesMember = "geometries";
    private const string GeometryCollection = "GeometryCollection";

    private const double MinLongitude = -180d;
    private const double MaxLongitude = 180d;
    private const double MinLatitude = -90d;
    private const double MaxLatitude = 90d;

    /// <summary>
    /// How deeply <c>coordinates</c> nests for each geometry type: a Point is
    /// one position, a LineString a list of positions, a Polygon a list of
    /// rings, and so on. Checking depth is what catches the common
    /// "right type, wrong nesting" mistake.
    /// </summary>
    private static readonly Dictionary<string, int> CoordinateDepthByType = new(StringComparer.Ordinal)
    {
        ["Point"] = 1,
        ["MultiPoint"] = 2,
        ["LineString"] = 2,
        ["MultiLineString"] = 3,
        ["Polygon"] = 3,
        ["MultiPolygon"] = 4,
    };

    /// <summary>
    /// Validates one GeoJson value, or every element when the field is an array.
    /// <c>null</c> is valid — nullability is the field definition's business,
    /// not this type's.
    /// </summary>
    /// <exception cref="GeoJsonValidationException">The value is not a well-formed geometry.</exception>
    public static void Validate(object? value)
    {
        if (value is null) return;

        // An array-typed GeoJson field arrives as a list of geometries. A list
        // is never itself a geometry, so descending is unambiguous.
        if (value is not IDictionary<string, object?> && value is IEnumerable and not string)
        {
            foreach (var item in (IEnumerable)value)
                Validate(item);
            return;
        }

        ValidateGeometry(value);
    }

    private static void ValidateGeometry(object? value)
    {
        if (value is null) return;

        var geometry = AsDictionary(value)
            ?? throw new GeoJsonValidationException(UnknownType(string.Empty));

        var type = ReadTypeMember(geometry);

        if (type == GeometryCollection)
        {
            ValidateGeometryCollection(geometry);
            return;
        }

        if (!CoordinateDepthByType.TryGetValue(type, out var depth))
            throw new GeoJsonValidationException(UnknownType(type));

        if (!TryGetMember(geometry, CoordinatesMember, out var coordinates))
            throw new GeoJsonValidationException(ShapeMismatch(type));

        ValidateCoordinates(coordinates, depth, type);
    }

    private static void ValidateGeometryCollection(IDictionary<string, object?> geometry)
    {
        if (!TryGetMember(geometry, GeometriesMember, out var geometries)
            || geometries is not IEnumerable list
            || geometries is string)
        {
            throw new GeoJsonValidationException(ShapeMismatch(GeometryCollection));
        }

        // A member geometry is validated as a geometry in its own right, so a
        // nested collection or a bad coordinate inside one is caught with the
        // reason naming the inner type rather than the collection.
        foreach (var member in list)
            ValidateGeometry(member);
    }

    /// <summary>
    /// Walks <c>coordinates</c> down to the depth the type implies. At depth 1
    /// the value must be a position — a pair of numbers in range.
    /// </summary>
    private static void ValidateCoordinates(object? coordinates, int depth, string type)
    {
        if (depth == 1)
        {
            ValidatePosition(coordinates, type);
            return;
        }

        if (coordinates is not IEnumerable list || coordinates is string)
            throw new GeoJsonValidationException(ShapeMismatch(type));

        var isEmpty = true;
        foreach (var item in list)
        {
            isEmpty = false;
            ValidateCoordinates(item, depth - 1, type);
        }

        // An empty list at any level cannot describe the geometry its type
        // claims, and Mongo would happily store the nonsense.
        if (isEmpty)
            throw new GeoJsonValidationException(ShapeMismatch(type));
    }

    private static void ValidatePosition(object? position, string type)
    {
        if (position is not IEnumerable list || position is string)
            throw new GeoJsonValidationException(ShapeMismatch(type));

        var values = new List<object?>();
        foreach (var item in list)
            values.Add(item);

        // RFC 7946 allows an optional third element (altitude), which is
        // passed through unchecked; fewer than two is not a position.
        if (values.Count < 2)
            throw new GeoJsonValidationException(ShapeMismatch(type));

        if (!TryToDouble(values[0], out var longitude) || !TryToDouble(values[1], out var latitude))
            throw new GeoJsonValidationException(ShapeMismatch(type));

        if (longitude < MinLongitude || longitude > MaxLongitude)
            throw new GeoJsonValidationException(
                $"longitude {Format(longitude)} is out of range [{Format(MinLongitude)}, {Format(MaxLongitude)}]");

        if (latitude < MinLatitude || latitude > MaxLatitude)
            throw new GeoJsonValidationException(
                $"latitude {Format(latitude)} is out of range [{Format(MinLatitude)}, {Format(MaxLatitude)}]");
    }

    private static string ReadTypeMember(IDictionary<string, object?> geometry)
    {
        if (!TryGetMember(geometry, TypeMember, out var rawType))
            throw new GeoJsonValidationException(UnknownType(string.Empty));

        return rawType as string
            ?? throw new GeoJsonValidationException(UnknownType(rawType?.ToString() ?? string.Empty));
    }

    /// <summary>
    /// GeoJSON member names are case-sensitive per RFC 7946, but a value that
    /// has round-tripped through BSON or a client can arrive differently cased;
    /// the exact spelling is preferred and the case-insensitive match is a
    /// fallback rather than the rule.
    /// </summary>
    private static bool TryGetMember(IDictionary<string, object?> geometry, string name, out object? value)
    {
        if (geometry.TryGetValue(name, out value)) return true;

        foreach (var pair in geometry)
        {
            if (!string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) continue;
            value = pair.Value;
            return true;
        }

        value = null;
        return false;
    }

    private static IDictionary<string, object?>? AsDictionary(object value)
    {
        if (value is IDictionary<string, object?> typed) return typed;

        // Values read back out of Mongo arrive as IDictionary<string, object>.
        if (value is IDictionary raw)
        {
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (DictionaryEntry entry in raw)
            {
                if (entry.Key is string key) result[key] = entry.Value;
            }
            return result;
        }

        return null;
    }

    private static bool TryToDouble(object? value, out double result)
    {
        switch (value)
        {
            case double d: result = d; return true;
            case float f: result = f; return true;
            case int i: result = i; return true;
            case long l: result = l; return true;
            case decimal m: result = (double)m; return true;
            case string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed):
                result = parsed;
                return true;
            default:
                result = 0;
                return false;
        }
    }

    private static string UnknownType(string type) => $"unknown geometry type '{type}'";

    private static string ShapeMismatch(string type) =>
        $"coordinates must be an array of [longitude, latitude] pairs matching type '{type}'";

    private static string Format(double value) => value.ToString("0.############", CultureInfo.InvariantCulture);
}
