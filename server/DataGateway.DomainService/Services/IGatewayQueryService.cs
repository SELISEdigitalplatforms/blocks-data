using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IGatewayQueryService
{
    Task<QueryResponse<Dictionary<string, object>>> QueryAsync(
        GatewayQueryRequest request,
        SchemaDefinitionExtended schema);

    Task<Dictionary<string, object>?> GetByIdAsync(
        string id,
        List<string>? fields,
        SchemaDefinitionExtended schema);
}
