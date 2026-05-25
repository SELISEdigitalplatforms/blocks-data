namespace DataGateway.DomainService.Models;

public class UpdateSchemaRequest : CreateSchemaRequest
{
    public string ItemId { get; set; } = string.Empty;
}
