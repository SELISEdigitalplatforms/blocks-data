

using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaDefinitionService
{
    Task<ServiceResponse<ActionResponse>> CreateSchemaAsync(CreateSchemaRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateSchemaAsync(UpdateSchemaRequest request);
    Task<ServiceResponse<ActionResponse>> SaveFieldDefinitionAsync(SaveFieldDefinitionRequest request);
    Task<ServiceResponse<ActionResponse>> CreateSchemaDefinitionAsync(CreateSchemaDefinitionRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateSchemaDefinitionAsync(UpdateSchemaDefinitionRequest request);
    Task<ServiceResponse<ActionResponse>> DeleteSchemaAsync(string id);
    Task<ServiceResponse<SchemaDefinitionResponse>> GetSchemaByIdAsync(string id);
    Task<PaginationResponse<SchemaDefinitionResponse>> GetAllSchemasAsync(GetSchemaDefinitionListRequest request);

    Task<ServiceResponse<SchemaAggregationResponse>> GetSchemaAggregationAsync();
    Task<Dictionary<string, bool>> ResetSchemaStructureAsync(int pageNo = 1, int pageSize = 10);
    Task<ServiceResponse<CollectionListResponse>> GetEntityCollectionsAsync();
    Task<ServiceResponse<CollectionDetailResponse>> GetEntityCollectionByNameAsync(string projectSchemaName);
}
