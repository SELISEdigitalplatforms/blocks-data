namespace DataGateway.DomainService.Models.Responses;

public class SchemaDefinitionListResponse
{
    public PaginationResponse<SchemaDefinitionResponse> Schemas { get; set; } = new();
    public SchemaAggregationResponse Aggregation { get; set; } = new();
}
