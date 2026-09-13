namespace DataGateway.DomainService.Models;

public class CreateSchemaIndexRequest
{
    public string SchemaDefinitionItemId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public List<IndexFieldRequest> Fields { get; set; } = [];
    public bool IsUnique { get; set; }
}

public class IndexFieldRequest
{
    public string FieldName { get; set; } = string.Empty;
    public SortDirection Direction { get; set; } = SortDirection.ASC;
}
