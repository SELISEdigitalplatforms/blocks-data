namespace DataGateway.Rest;

/// <summary>
/// The REST API's request limits, bound from configuration section <see cref="SectionName"/>. Settable properties
/// with defaults, so configuration binding can override any one of them.
/// </summary>
public sealed class RestLimits
{
    public const string SectionName = "DataGateway:Rest";

    /// <summary>The largest page a list request may ask for; a larger one is refused, not clamped.</summary>
    public int MaxPageSize { get; set; } = 1000;

    /// <summary>The page size when the request names none.</summary>
    public int DefaultPageSize { get; set; } = 10;

    /// <summary>The most records one bulk insert may carry.</summary>
    public int MaxBulkItems { get; set; } = 1000;

    /// <summary>The largest request body accepted, in bytes (10 MB).</summary>
    public long MaxRequestBodyBytes { get; set; } = 10485760;

    /// <summary>How deeply filter objects may nest in a <c>where</c>: the root is level 1, and each <c>and</c> / <c>or</c> item or nested DTO object adds one.</summary>
    public int MaxWhereDepth { get; set; } = 8;

    /// <summary>The most operator conditions one <c>where</c> may hold, counted across the whole tree.</summary>
    public int MaxWhereConditions { get; set; } = 100;
}
