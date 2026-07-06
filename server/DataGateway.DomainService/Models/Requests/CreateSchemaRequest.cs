using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class CreateSchemaRequest
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
}