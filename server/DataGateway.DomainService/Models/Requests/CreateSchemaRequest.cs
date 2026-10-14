using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

public class CreateSchemaRequest
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
}