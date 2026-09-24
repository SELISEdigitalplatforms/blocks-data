using HotChocolate;

namespace DataGateway.DomainService.Models;

/// <summary>
/// CLR backing for GraphQL <c>StringOperationFilterInput</c>. Uses <see cref="Optional{T}"/> so omitted fields are not defaulted.
/// </summary>
public sealed class StringOperationFilterInput
{
    public Optional<string?> Eq { get; set; }
    public Optional<string?> Neq { get; set; }
    public Optional<string?> Contains { get; set; }
    public Optional<string?> StartsWith { get; set; }
    public Optional<string?> EndsWith { get; set; }
    public Optional<object?> In { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>NumberOperationFilterInput</c> (Float comparisons).
/// </summary>
public sealed class NumberOperationFilterInput
{
    public Optional<double?> Eq { get; set; }
    public Optional<double?> Neq { get; set; }
    public Optional<double?> Gt { get; set; }
    public Optional<double?> Gte { get; set; }
    public Optional<double?> Lt { get; set; }
    public Optional<double?> Lte { get; set; }
    public Optional<object?> In { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>IntOperationFilterInput</c>.
/// </summary>
public sealed class IntOperationFilterInput
{
    public Optional<int?> Eq { get; set; }
    public Optional<int?> Neq { get; set; }
    public Optional<int?> Gt { get; set; }
    public Optional<int?> Gte { get; set; }
    public Optional<int?> Lt { get; set; }
    public Optional<int?> Lte { get; set; }
    public Optional<object?> In { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>BooleanOperationFilterInput</c>.
/// </summary>
public sealed class BooleanOperationFilterInput
{
    public Optional<bool?> Eq { get; set; }
    public Optional<bool?> Neq { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>DateTimeOperationFilterInput</c>.
/// </summary>
public sealed class DateTimeOperationFilterInput
{
    public Optional<DateTime?> Eq { get; set; }
    public Optional<DateTime?> Neq { get; set; }
    public Optional<DateTime?> Gt { get; set; }
    public Optional<DateTime?> Gte { get; set; }
    public Optional<DateTime?> Lt { get; set; }
    public Optional<DateTime?> Lte { get; set; }
    public Optional<object?> In { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>GeoJsonOperationFilterInput</c>.
///
/// Equality plus the geospatial operators <c>near</c>, <c>within</c> and <c>intersects</c>.
/// The <c>eq</c>/<c>neq</c> value is the whole geometry object, so
/// <c>object?</c> rather than a typed geometry: comparison is structural
/// document equality (same <c>type</c>, same <c>coordinates</c>), matching how
/// every other complex Bson value already compares. Geometric equivalence — a
/// polygon with reordered but equivalent rings — is a different and much
/// deeper question, and deliberately not what this does.
/// </summary>
public sealed class GeoJsonOperationFilterInput
{
    public Optional<object?> Eq { get; set; }
    public Optional<object?> Neq { get; set; }
    public Optional<GeoJsonNearInput?> Near { get; set; }
    public Optional<GeoJsonGeometryFilterInput?> Within { get; set; }
    public Optional<GeoJsonGeometryFilterInput?> Intersects { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>GeoJsonNearInput</c>: a reference Point and a distance in meters.
/// </summary>
public sealed class GeoJsonNearInput
{
    public object? Geometry { get; set; }
    public double MaxDistanceMeters { get; set; }
    public Optional<double?> MinDistanceMeters { get; set; }
}

/// <summary>
/// CLR backing for GraphQL <c>GeoJsonGeometryFilterInput</c>, shared by <c>within</c> and
/// <c>intersects</c>: a single reference geometry.
/// </summary>
public sealed class GeoJsonGeometryFilterInput
{
    public object? Geometry { get; set; }
}
