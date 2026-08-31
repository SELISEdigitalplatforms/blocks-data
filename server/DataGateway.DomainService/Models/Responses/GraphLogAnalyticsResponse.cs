namespace DataGateway.DomainService.Models.Responses;

public class GraphLogAnalyticsResponse
{
    /// <summary>Request counts per day/week across the requested range, oldest first, with zero-filled gaps.</summary>
    public List<GraphLogRequestsOverTimeBucket> RequestsOverTime { get; set; } = [];

    /// <summary>Per-field call stats across the requested range, sorted by <see cref="GraphLogOperationStat.Calls"/> descending.</summary>
    public List<GraphLogOperationStat> OperationStats { get; set; } = [];

    /// <summary>Failed requests grouped by reason, most frequent first. Empty when nothing failed.</summary>
    public List<GraphLogFailureStat> FailureStats { get; set; } = [];
}

/// <summary>How many requests failed for one reason (a <see cref="Helpers.GatewayFailureKind"/> value).</summary>
public class GraphLogFailureStat
{
    public string FailureKind { get; set; } = string.Empty;
    public int Count { get; set; }
}
