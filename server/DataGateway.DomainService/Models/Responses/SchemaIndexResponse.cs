using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Models.Responses;

public class SchemaIndexResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<IndexFieldResponse> Fields { get; set; } = [];
    public bool IsUnique { get; set; }
    public DateTime CreatedDate { get; set; }
}

public class IndexFieldResponse
{
    public string FieldName { get; set; } = string.Empty;
    public SortDirection Direction { get; set; }
}

public class SchemaIndexListResponse
{
    public List<SchemaIndexResponse> Indexes { get; set; } = [];
}
