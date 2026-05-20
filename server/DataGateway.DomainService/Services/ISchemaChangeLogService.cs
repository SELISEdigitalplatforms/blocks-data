using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaChangeLogService
{
    /// <summary>
    /// Creates a schema change log entry with the given schema id and change type.
    /// </summary>
    Task<SchemaChangeLog> CreateSchemaChangeLogAsync(string schemaId, SchemaChangeType changeType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all schema change logs where DoesServerAdoptChanges is false.
    /// </summary>
    Task<ServiceResponse<List<SchemaChangeLog>>> GetUnadaptedSchemaChangeLogsAsync(CancellationToken cancellationToken = default);
}
