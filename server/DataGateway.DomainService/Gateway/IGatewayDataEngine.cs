using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Gateway;

/// <summary>
/// The gateway's data operations, independent of transport and of storage. A transport adapter
/// (GraphQL today) turns its request into one of the commands and calls the engine; the engine
/// owns access checks, policy, validation and the database work, and reports failures as
/// <see cref="GatewayException"/>.
/// </summary>
public interface IGatewayDataEngine
{
    Task<QueryResponse<Dictionary<string, object>>> QueryAsync(EntityModel entity, QueryCommand command);
    Task<ActionResponse> InsertAsync(EntityModel entity, InsertCommand command);
    Task<BulkActionResponse> InsertManyAsync(EntityModel entity, InsertManyCommand command);
    Task<ActionResponse> UpdateAsync(EntityModel entity, UpdateCommand command);
    Task<ActionResponse> UpdateManyAsync(EntityModel entity, UpdateManyCommand command);
    Task<ActionResponse> DeleteAsync(EntityModel entity, DeleteCommand command);
    Task<ActionResponse> DeleteManyAsync(EntityModel entity, DeleteManyCommand command);
}
