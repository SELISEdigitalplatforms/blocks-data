using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataValidationService
{
    /// <summary>
    /// Creates a new data validation
    /// </summary>
    Task<ServiceResponse<ActionResponse>> CreateDataValidationAsync(CreateDataValidationRequest request);

    /// <summary>
    /// Updates an existing data validation
    /// </summary>
    Task<ServiceResponse<ActionResponse>> UpdateDataValidationAsync(UpdateDataValidationRequest request);

    /// <summary>
    /// Deletes a data validation by its ID
    /// </summary>
    Task<ServiceResponse<ActionResponse>> DeleteDataValidationAsync(string id);

    /// <summary>
    /// Gets a data validation by its ID
    /// </summary>
    Task<ServiceResponse<DataValidationResponse>> GetDataValidationByIdAsync(string id);

    /// <summary>
    /// Gets all data validations with pagination and filtering
    /// </summary>
    Task<ServiceResponse<PaginationResponse<DataValidationResponse>>> GetAllDataValidationsAsync(GetDataValidationListRequest request);

    /// <summary>
    /// Gets all validations for a specific schema
    /// </summary>
    Task<ServiceResponse<List<DataValidationResponse>>> GetValidationsBySchemaIdAsync(string schemaId);

    /// <summary>
    /// Gets validation for a specific field in a schema
    /// </summary>
    Task<ServiceResponse<DataValidationResponse>> GetValidationBySchemaAndFieldAsync(string schemaId, string fieldName);
}
