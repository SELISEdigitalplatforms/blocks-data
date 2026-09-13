using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaIndexService
{
    Task<ServiceResponse<ActionResponse>> CreateIndexAsync(CreateSchemaIndexRequest request);
    Task<ServiceResponse<SchemaIndexListResponse>> GetIndexesAsync(string schemaDefinitionItemId);
    Task<ServiceResponse<ActionResponse>> DeleteIndexAsync(string itemId);
}
