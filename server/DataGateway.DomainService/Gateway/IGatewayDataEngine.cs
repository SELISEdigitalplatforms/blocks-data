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

    /// <summary>
    /// One row by id, with the same access checks as a query. Null both when there is no such row and when the
    /// row rules hide it from the caller.
    /// </summary>
    Task<Dictionary<string, object>?> GetByIdAsync(EntityModel entity, string itemId, IReadOnlyList<string> select, string operationName);

    /// <summary>
    /// Updates the row with this id (merging the sent fields), or inserts it when there is none. A row that exists but
    /// is hidden from the caller by the row rules comes back as a <see cref="NotFoundActionResponse"/> and is never
    /// inserted over.
    /// </summary>
    Task<UpsertResult> UpsertAsync(EntityModel entity, UpsertCommand command);
}
