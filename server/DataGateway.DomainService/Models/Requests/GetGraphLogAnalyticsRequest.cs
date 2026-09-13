namespace DataGateway.DomainService.Models;

public class GetGraphLogAnalyticsRequest
{
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }

    /// <summary>
    /// The viewer's offset from UTC, in minutes (for example, 360 for UTC+06:00). Calendar-day
    /// ranges and chart buckets use this offset so they agree with locally rendered request times.
    /// </summary>
    public int? UtcOffsetMinutes { get; set; }

    /// <summary>
    /// "hourly", "daily" (default) or "weekly" — bucket size for every series in
    /// <see cref="Responses.GraphLogAnalyticsResponse"/>.
    /// </summary>
    public string Granularity { get; set; } = "daily";
}
