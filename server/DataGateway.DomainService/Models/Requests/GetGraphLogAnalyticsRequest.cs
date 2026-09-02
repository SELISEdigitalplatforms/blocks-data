namespace DataGateway.DomainService.Models;

public class GetGraphLogAnalyticsRequest
{
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }

    /// <summary>
    /// "hourly", "daily" (default) or "weekly" — bucket size for every series in
    /// <see cref="Responses.GraphLogAnalyticsResponse"/>.
    /// </summary>
    public string Granularity { get; set; } = "daily";
}
