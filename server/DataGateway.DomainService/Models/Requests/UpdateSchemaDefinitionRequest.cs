namespace DataGateway.DomainService.Models;

public class UpdateSchemaDefinitionRequest : CreateSchemaDefinitionRequest
{
    public string ItemId { get; set; } = string.Empty;
}
