namespace DataGateway.DomainService.Models;

public class CollectionsDataCount
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public long Count { get; set; }
}
