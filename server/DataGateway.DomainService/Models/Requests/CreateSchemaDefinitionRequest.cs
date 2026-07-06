using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class CreateSchemaDefinitionRequest : CreateSchemaRequest
{
    public List<FieldDefinitionRequest> Fields { get; set; } = [];
}

public class FieldDefinitionRequest
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsArray { get; set; }
    public bool IsPIIData { get; set; }
    public bool IsUniqueData { get; set; }
    public string Description { get; set; } = string.Empty;
}
