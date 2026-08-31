namespace DataGateway.DomainService.Models.Responses;

public class GraphLogAnalyticsResponse
{
    /// <summary>Request counts per day/week across the requested range, oldest first, with zero-filled gaps.</summary>
    public List<GraphLogRequestsOverTimeBucket> RequestsOverTime { get; set; } = [];

    /// <summary>Per-field call stats across the requested range, sorted by <see cref="GraphLogOperationStat.Calls"/> descending.</summary>
    public List<GraphLogOperationStat> OperationStats { get; set; } = [];
}
