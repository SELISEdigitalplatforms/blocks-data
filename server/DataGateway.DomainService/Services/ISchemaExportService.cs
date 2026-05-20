using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaExportService
{
    /// <summary>
    /// Called by the API controller: generates a fileId, publishes a SchemaExportEvent to the queue, and returns immediately.
    /// </summary>
    Task<ServiceResponse<ActionResponse>> InitiateExportAsync(ExportSchemaRequest request);

    /// <summary>
    /// Called by the Worker consumer: fetches schemas, policies, and validations, builds export documents, and serializes them to JSON bytes.
    /// </summary>
    Task<(byte[] JsonBytes, string FileName)> BuildExportBytesAsync(SchemaExportEvent exportEvent);

    /// <summary>
    /// Persists a SchemaExportRecord in the database after a successful upload.
    /// </summary>
    Task InsertExportRecordAsync(SchemaExportEvent exportEvent, string fileName);
}
