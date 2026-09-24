using System.Collections;
using DataGateway.DomainService.Helpers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Conversion;

/// <summary>
/// Translates the GeoJson <c>near</c> / <c>within</c> / <c>intersects</c> filter operators into the
/// field-level MongoDB operator clauses that back them, after validating the reference geometry
/// and distances. Every rejection is an <see cref="InvalidWhereFilterException"/>, so a bad
/// operand never reaches Mongo.
///
/// <c>near</c> is expressed as <c>$geoWithin</c> + <c>$centerSphere</c> rather than
/// <c>$nearSphere</c>. The two select the same documents, but <c>$nearSphere</c> is rejected inside
/// <c>$or</c> and inside the aggregation <c>$match</c> that <c>CountDocumentsAsync</c> issues for the
/// total count of every query — so it would fail the moment a page of results was requested.
/// <c>$geoWithin</c> works in both, is served by the same 2dsphere index, and does not impose a
/// distance ordering (distance sorting is out of scope for this feature).
/// </summary>
internal static class GeoJsonGeospatialFilter
{
    public const string Near = "near";
    public const string Within = "within";
    public const string Intersects = "intersects";

    /// <summary>MongoDB's spherical earth radius, in meters, for converting meters to radians.</summary>
    internal const double EarthRadiusMeters = 6378100d;

    public static bool IsGeospatialOperator(string operatorName) =>
        operatorName.Equals(Near, StringComparison.OrdinalIgnoreCase)
        || operatorName.Equals(Within, StringComparison.OrdinalIgnoreCase)
        || operatorName.Equals(Intersects, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Builds the predicates for one geospatial operator. Each returned document is a complete
    /// field-level operator document (e.g. <c>{ $geoWithin: ... }</c>) and must be applied to the
    /// field as its own clause: MongoDB parses a geo operator's siblings as options to it, so
    /// combining <c>$geoWithin</c> with <c>$not</c> or another operator in one object is rejected.
    /// </summary>
    public static IEnumerable<BsonDocument> Build(
        string operatorName,
        object operand,
        Func<object, IReadOnlyDictionary<string, object?>?> coerce,
        Func<object?, BsonValue> toBson)
    {
        var args = coerce(operand) ?? throw Invalid(operatorName, "an object with a 'geometry' member is required");
        var geometry = ReadGeometry(operatorName, args);

        switch (operatorName.ToLowerInvariant())
        {
            case Near:
                return BuildNear(args, geometry, toBson);
            case Within:
                if (geometry.Type is not ("Polygon" or "MultiPolygon"))
                    throw Invalid(Within, $"'within' requires a Polygon or MultiPolygon, not '{geometry.Type}'");
                return [new BsonDocument("$geoWithin", new BsonDocument("$geometry", toBson(geometry.Value)))];
            default:
                return [new BsonDocument("$geoIntersects", new BsonDocument("$geometry", toBson(geometry.Value)))];
        }
    }

    private static IEnumerable<BsonDocument> BuildNear(
        IReadOnlyDictionary<string, object?> args,
        (string Type, IDictionary<string, object?> Value) geometry,
        Func<object?, BsonValue> toBson)
    {
        if (geometry.Type != "Point")
            throw Invalid(Near, $"'near' requires a Point, not '{geometry.Type}'");

        var maxDistance = ReadDistance(args, "maxDistanceMeters")
            ?? throw new InvalidWhereFilterException("near.maxDistanceMeters must be a positive number");
        var minDistance = ReadDistance(args, "minDistanceMeters");

        if (minDistance.HasValue && minDistance.Value >= maxDistance)
            throw new InvalidWhereFilterException("near.minDistanceMeters must be less than near.maxDistanceMeters");

        var center = toBson(ReadMember(geometry.Value, "coordinates"));
        var predicates = new List<BsonDocument>
        {
            new("$geoWithin", CenterSphere(center, maxDistance)),
        };

        if (minDistance.HasValue)
            predicates.Add(new BsonDocument("$not", new BsonDocument("$geoWithin", CenterSphere(center, minDistance.Value))));

        return predicates;
    }

    private static BsonDocument CenterSphere(BsonValue center, double meters) =>
        new("$centerSphere", new BsonArray { center, meters / EarthRadiusMeters });

    private static (string Type, IDictionary<string, object?> Value) ReadGeometry(
        string operatorName,
        IReadOnlyDictionary<string, object?> args)
    {
        var raw = ReadMember(args, "geometry");
        if (raw is not IDictionary<string, object?> geometry)
            throw Invalid(operatorName, "a GeoJSON geometry object is required");

        try
        {
            GeoJsonValidator.Validate(geometry);
        }
        catch (GeoJsonValidationException ex)
        {
            throw Invalid(operatorName, ex.Reason);
        }

        // Validate has already guaranteed a string 'type' member.
        return ((string)ReadMember(geometry, "type")!, geometry);
    }

    /// <summary>
    /// Reads a distance, which must be a finite number greater than zero. Returns null when
    /// absent; a distance that is present but unusable is an error rather than being ignored.
    /// </summary>
    private static double? ReadDistance(IReadOnlyDictionary<string, object?> args, string name)
    {
        var raw = ReadMember(args, name);
        if (raw is null) return null;

        var value = raw switch
        {
            double d => d,
            float f => f,
            int i => i,
            long l => l,
            decimal m => (double)m,
            _ => double.NaN,
        };

        if (double.IsNaN(value) || double.IsInfinity(value) || value <= 0)
            throw new InvalidWhereFilterException($"near.{name} must be a positive number");

        return value;
    }

    private static object? ReadMember(IEnumerable<KeyValuePair<string, object?>> source, string name)
    {
        foreach (var pair in source)
        {
            if (string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase))
                return pair.Value;
        }
        return null;
    }

    private static InvalidWhereFilterException Invalid(string operatorName, string reason) =>
        new($"GeoJson filter '{operatorName}' requires a valid reference geometry: {reason}");
}
