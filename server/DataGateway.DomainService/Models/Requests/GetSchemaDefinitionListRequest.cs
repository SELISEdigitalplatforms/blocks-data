using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class GetSchemaDefinitionListRequest : BasePaginationRequest, IProjectKey
{
    public string? Keyword { get; set; }
    public string? SchemaName { get; set; }
    public string? CollectionName { get; set; }
    public string ProjectKey { get; set; } = string.Empty;
    public SchemaType? SchemaType { get; set; }
}
