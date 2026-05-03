using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class CreateSchemaRequest : IProjectKey
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
}