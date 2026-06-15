using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IGatewayMutationService
{
    Task<ActionResponse> InsertAsync(
        SchemaDefinitionExtended schema,
        Dictionary<string, object?> input);

    Task<ActionResponse> UpdateAsync(
        SchemaDefinitionExtended schema,
        string id,
        Dictionary<string, object?> input);

    Task<ActionResponse> DeleteAsync(
        SchemaDefinitionExtended schema,
        string id,
        bool hardDelete);

    Task<BulkActionResponse> BulkInsertAsync(
        SchemaDefinitionExtended schema,
        List<Dictionary<string, object?>> items);

    Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        GatewayBulkUpdateRequest request);

    Task<ActionResponse> BulkDeleteAsync(
        SchemaDefinitionExtended schema,
        GatewayBulkDeleteRequest request);
}
