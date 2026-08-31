namespace DataGateway.DomainService.Models;

public class GetGraphLogAnalyticsRequest
{
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }

    /// <summary>"daily" (default) or "weekly" — bucket size for <see cref="Responses.GraphLogAnalyticsResponse.RequestsOverTime"/>.</summary>
    public string Granularity { get; set; } = "daily";
}
