namespace DataGateway.DomainService.Models.Responses;

public class GraphLogAnalyticsResponse
{
    /// <summary>Request counts per day/week across the requested range, oldest first, with zero-filled gaps.</summary>
    public List<GraphLogRequestsOverTimeBucket> RequestsOverTime { get; set; } = [];

    /// <summary>Per-field call stats across the requested range, sorted by <see cref="GraphLogOperationStat.Calls"/> descending.</summary>
    public List<GraphLogOperationStat> OperationStats { get; set; } = [];

    /// <summary>Failed requests grouped by reason, most frequent first. Empty when nothing failed.</summary>
    public List<GraphLogFailureStat> FailureStats { get; set; } = [];

    /// <summary>Response-time percentiles across the whole range.</summary>
    public GraphLogLatencySummary Latency { get; set; } = new();

    /// <summary>Response-time percentiles per bucket, oldest first, aligned with <see cref="RequestsOverTime"/>.</summary>
    public List<GraphLogLatencyBucket> LatencyOverTime { get; set; } = [];

    /// <summary>Bytes moved per bucket, oldest first, aligned with <see cref="RequestsOverTime"/>.</summary>
    public List<GraphLogThroughputBucket> ThroughputOverTime { get; set; } = [];

    /// <summary>Total bytes moved across the whole range.</summary>
    public GraphLogThroughputSummary Throughput { get; set; } = new();

    /// <summary>Failures per schema and reason, most frequent first. Empty when nothing failed.</summary>
    public List<GraphLogFailureHotspot> FailureHotspots { get; set; } = [];

    /// <summary>
    /// Every entity schema defined for the tenant with its traffic in the range — including the
    /// ones with none, which is the half the trace store alone cannot tell you.
    /// </summary>
    public List<GraphLogSchemaCoverage> SchemaCoverage { get; set; } = [];

    /// <summary>Where an average request's time goes.</summary>
    public GraphLogTimingBreakdown Timing { get; set; } = new();
}

/// <summary>
/// Mean milliseconds per phase of a request, so "this schema is slow" can become "policy
/// evaluation is most of it". The named phases plus <see cref="AverageOther"/> add up to
/// <see cref="AverageTotal"/>; nothing is counted twice.
/// </summary>
public class GraphLogTimingBreakdown
{
    public double AverageTotal { get; set; }
    public double AveragePolicy { get; set; }
    public double AverageValidation { get; set; }
    public double AverageDatabase { get; set; }
    public double AveragePublish { get; set; }

    /// <summary>
    /// Whatever the measured phases do not account for: GraphQL parsing and serialization, the
    /// HTTP pipeline, and time on the wire.
    /// </summary>
    public double AverageOther { get; set; }
}

/// <summary>
/// One entity schema's traffic. Reads and writes are counted separately because they say different
/// things: a schema that is only ever read may not need its write policy, and a schema with neither
/// may not need to exist.
/// </summary>
public class GraphLogSchemaCoverage
{
    public string EntityName { get; set; } = string.Empty;
    public int Calls { get; set; }
    public int Queries { get; set; }
    public int Mutations { get; set; }
}

/// <summary>
/// Bytes in and out for one time bucket, from the span's request/response size attributes.
/// </summary>
public class GraphLogThroughputBucket
{
    public DateTime Date { get; set; }
    public long RequestBytes { get; set; }
    public long ResponseBytes { get; set; }
}

public class GraphLogThroughputSummary
{
    public long RequestBytes { get; set; }
    public long ResponseBytes { get; set; }
    public long TotalBytes { get; set; }
}

/// <summary>
/// Response times in milliseconds. Percentiles rather than just an average: one slow request in a
/// hundred is invisible in a mean, and is exactly the one a caller complains about.
/// </summary>
public class GraphLogLatencySummary
{
    public double P50 { get; set; }
    public double P95 { get; set; }
    public double P99 { get; set; }
    public double Max { get; set; }
    public double Average { get; set; }
}

/// <summary>Response-time percentiles for one time bucket. Zeroes mean the bucket had no requests.</summary>
public class GraphLogLatencyBucket
{
    public DateTime Date { get; set; }
    public double P50 { get; set; }
    public double P95 { get; set; }
    public double P99 { get; set; }
}

/// <summary>
/// Failures for one schema/reason pair. The shape that separates a misconfigured policy — one
/// schema, one reason, steady — from probing, which shows up across many schemas and comes from
/// outside the app (<see cref="ExternalCount"/>).
/// </summary>
public class GraphLogFailureHotspot
{
    public string SchemaName { get; set; } = string.Empty;
    public string FailureKind { get; set; } = string.Empty;
    public int Count { get; set; }

    /// <summary>How many of <see cref="Count"/> came from outside the app (not an in-app request).</summary>
    public int ExternalCount { get; set; }
}

/// <summary>How many requests failed for one reason (a <see cref="Helpers.GatewayFailureKind"/> value).</summary>
public class GraphLogFailureStat
{
    public string FailureKind { get; set; } = string.Empty;
    public int Count { get; set; }
}
