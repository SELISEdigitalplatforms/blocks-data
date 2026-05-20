namespace DataGateway.DomainService.Models;

public class BulkActionResponse
{
    public bool Acknowledged { get; set; }
    public long TotalImpactedData { get; set; }
    public string? Message { get; set; }
    /// <summary>Created item IDs for bulk insert operations.</summary>
    public List<string> ItemIds { get; set; } = [];
}
