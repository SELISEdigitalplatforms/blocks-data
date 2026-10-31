using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Services;

public interface ISchemaChangeLogService
{
    /// <summary>
    /// Creates a schema change log entry with the given schema id and change type.
    /// </summary>
    Task<SchemaChangeLog> CreateSchemaChangeLogAsync(string schemaId, SchemaChangeType changeType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tells the people who own the schema (creator and last editor, not the actor) that it changed. Best effort:
    /// never throws, so the schema change is never turned into a failure.
    /// </summary>
    Task NotifyChangedAsync(SchemaDefinition schema, SchemaChangeType changeType);

    /// <summary>
    /// Gets all schema change logs where DoesServerAdoptChanges is false.
    /// </summary>
    Task<ServiceResponse<List<SchemaChangeLog>>> GetUnadaptedSchemaChangeLogsAsync(CancellationToken cancellationToken = default);
}
