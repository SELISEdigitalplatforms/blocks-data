using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface ISchemaImportService
{
    /// <summary>
    /// Called by the API controller: validates the request, publishes a SchemaImportEvent to the queue, and returns immediately.
    /// </summary>
    Task<ServiceResponse<ActionResponse>> InitiateImportAsync(ImportSchemaRequest request);

    /// <summary>
    /// Called by the Worker consumer: deserializes the exported JSON bytes, validates the documents,
    /// and upserts schemas, access policies, and validation rules.
    /// Returns the count of schemas imported.
    /// </summary>
    Task<int> ProcessImportAsync(SchemaImportEvent importEvent, byte[] jsonBytes);

}
