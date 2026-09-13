namespace DataGateway.DomainService.Models;

public class GetGraphLogHistoryRequest : BasePaginationRequest
{
    public string? SchemaName { get; set; }
    public string? EntityName { get; set; }
    public string? OperationType { get; set; }
    public string? ResponseStatus { get; set; }
    /// <summary>Reader-facing outcome: allowed, denied, or error.</summary>
    public string? Outcome { get; set; }

    /// <summary>Exact HTTP response status code.</summary>
    public int? StatusCode { get; set; }

    /// <summary>One of the <see cref="Helpers.GatewayFailureKind"/> values.</summary>
    public string? FailureKind { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }

    /// <summary>
    /// The viewer's offset from UTC, in minutes (for example, 360 for UTC+06:00). Date-only range
    /// boundaries are interpreted in that local time rather than at UTC midnight.
    /// </summary>
    public int? UtcOffsetMinutes { get; set; }

    public GetGraphLogHistoryRequest()
    {
        SortBy = "Timestamp";
        SortDescending = true;
    }
}
