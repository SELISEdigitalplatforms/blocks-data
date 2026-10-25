

using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaDefinitionService
{
    Task<ServiceResponse<ActionResponse>> CreateSchemaAsync(CreateSchemaRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateSchemaAsync(UpdateSchemaRequest request);
    Task<ServiceResponse<ActionResponse>> SaveFieldDefinitionAsync(SaveFieldDefinitionRequest request);
    /// <summary>Sets or clears (null) one property's default value, checked first; marks the schema as changed.</summary>
    Task<ServiceResponse<ActionResponse>> SetFieldDefaultAsync(SetFieldDefaultRequest request);
    Task<ServiceResponse<ActionResponse>> CreateSchemaDefinitionAsync(CreateSchemaDefinitionRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateSchemaDefinitionAsync(UpdateSchemaDefinitionRequest request);
    Task<ServiceResponse<ActionResponse>> DeleteSchemaAsync(string id);
    Task<ServiceResponse<SchemaDefinitionResponse>> GetSchemaByIdAsync(string id);
    Task<PaginationResponse<SchemaDefinitionResponse>> GetAllSchemasAsync(GetSchemaDefinitionListRequest request);

    Task<ServiceResponse<SchemaAggregationResponse>> GetSchemaAggregationAsync();

    /// <summary>
    /// Every Entity schema a Reference or Must not exist in rule can point at, the tenant's and the system's, in two
    /// groups of at most <see cref="SchemaDefinitionService.ReferenceTargetsPerGroup"/>, optionally narrowed to names
    /// and descriptions containing <paramref name="keyword"/>. With <paramref name="schemaName"/>, only the schema of
    /// exactly that name, however many others mention it.
    /// </summary>
    Task<ServiceResponse<ReferenceTargetsResponse>> GetReferenceTargetsAsync(string? keyword, string? schemaName = null);
    Task<Dictionary<string, bool>> ResetSchemaStructureAsync(int pageNo = 1, int pageSize = 10);
    Task<ServiceResponse<CollectionListResponse>> GetEntityCollectionsAsync();
    Task<ServiceResponse<CollectionDetailResponse>> GetEntityCollectionByNameAsync(string projectSchemaName);
}
