namespace DataGateway.DomainService.Models;

public class GetGraphLogHistoryRequest : BasePaginationRequest
{
    public string? SchemaName { get; set; }
    public string? EntityName { get; set; }
    public string? OperationType { get; set; }
    public string? ResponseStatus { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }

    public GetGraphLogHistoryRequest()
    {
        SortBy = "Timestamp";
        SortDescending = true;
    }
}
