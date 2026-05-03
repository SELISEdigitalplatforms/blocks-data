using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Api.Controllers
{
    /// <summary>
    /// DataValidationController is responsible for managing data validation rules.
    /// It provides endpoints to create, update, delete, and retrieve validation rules for schema fields.
    /// </summary>
    [Route("data-validations")]
    [ApiController]
    public class DataValidationController : ControllerBase
    {
        private readonly IDataValidationService _dataValidationService;
        private readonly ChangeControllerContext _changeControllerContext;

        /// <summary>
        /// Initializes a new instance of the <see cref="DataValidationController"/> class.
        /// </summary>
        /// <param name="dataValidationService">The data validation service.</param>
        /// <param name="changeControllerContext">The change controller context.</param>
        public DataValidationController(IDataValidationService dataValidationService, ChangeControllerContext changeControllerContext)
        {
            _dataValidationService = dataValidationService;
            _changeControllerContext = changeControllerContext;
        }

        #region Get
        /// <summary>
        /// Retrieves a paginated list of all data validations. Use this endpoint to view all available validations, optionally filtered by schema ID or field name.
        /// </summary>
        /// <param name="request">Request parameters for pagination and filtering: SchemaId, FieldName, Keyword, PageNo, PageSize, SortBy, SortDescending.</param>
        /// <returns>Returns a paginated list of data validations.</returns>
        [Authorize]
        [HttpGet]
        [ProducesResponseType(typeof(ServiceResponse<PaginationResponse<DataValidationResponse>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetDataValidations([FromQuery] GetDataValidationListRequest request)
        {
            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = request.ProjectKey });
            var response = await _dataValidationService.GetAllDataValidationsAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Cloud use only: Retrieves the details of a specific data validation by its unique ID.
        /// </summary>
        /// <param name="id">The unique identifier of the data validation to retrieve.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns the data validation details if found, or an error message if not found.</returns>
        [Authorize]
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ServiceResponse<DataValidationResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetDataValidationById([FromRoute] string id, [FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_PROJECT_KEY" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetDataValidationByIdAsync(id);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Retrieves the details of a specific data validation by its unique ID.
        /// </summary>
        /// <param name="validationId">The unique identifier of the data validation to retrieve.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns the data validation details if found, or an error message if not found.</returns>
        [Authorize]
        [HttpGet("get-by-id")]
        [ProducesResponseType(typeof(ServiceResponse<DataValidationResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetDataValidationByIdAsync([FromQuery] string validationId, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(validationId))
                return StatusCode(400, new { Message = "INVALID_VALIDATION_ID" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetDataValidationByIdAsync(validationId);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Cloud use only: Retrieves all validations for a specific schema.
        /// </summary>
        /// <param name="schemaId">The schema ID to get validations for.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns a list of data validations for the schema.</returns>
        [Authorize]
        [HttpGet("schema/{schemaId}")]
        [ProducesResponseType(typeof(ServiceResponse<List<DataValidationResponse>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetValidationsBySchemaId([FromRoute] string schemaId, [FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_PROJECT_KEY" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetValidationsBySchemaIdAsync(schemaId);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Retrieves all validations for a specific schema.
        /// </summary>
        /// <param name="schemaId">The schema ID to get validations for.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns a list of data validations for the schema.</returns>
        [Authorize]
        [HttpGet("by-schema-id")]
        [ProducesResponseType(typeof(ServiceResponse<List<DataValidationResponse>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetValidationsBySchemaIdAsync([FromQuery] string schemaId, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(schemaId))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_ID" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetValidationsBySchemaIdAsync(schemaId);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Cloud use only: Retrieves validation for a specific field in a schema.
        /// </summary>
        /// <param name="schemaId">The schema ID.</param>
        /// <param name="fieldName">The field name.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns the data validation for the specified field.</returns>
        [Authorize]
        [HttpGet("schema/{schemaId}/field/{fieldName}")]
        [ProducesResponseType(typeof(ServiceResponse<DataValidationResponse>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetValidationBySchemaAndField([FromRoute] string schemaId, [FromRoute] string fieldName, [FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_PROJECT_KEY" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetValidationBySchemaAndFieldAsync(schemaId, fieldName);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Retrieves validation for a specific field in a schema.
        /// </summary>
        /// <param name="schemaId">The schema ID.</param>
        /// <param name="fieldName">The field name.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns the data validation for the specified field.</returns>
        [Authorize]
        [HttpGet("by-schema-and-field")]
        [ProducesResponseType(typeof(ServiceResponse<DataValidationResponse>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetValidationBySchemaAndFieldAsync([FromQuery] string schemaId, [FromQuery] string fieldName, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(schemaId) || string.IsNullOrWhiteSpace(fieldName))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_ID_OR_FIELD_NAME" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.GetValidationBySchemaAndFieldAsync(schemaId, fieldName);
            return StatusCode(response.HttpStatusCode, response);
        }
        #endregion

        #region Post

        /// <summary>
        /// Creates a new data validation. Use this endpoint to define validation rules for a schema field.
        /// </summary>
        /// <param name="request">Data validation details: SchemaId, FieldName, Validations (list of validation rules).</param>
        /// <returns>Returns the created data validation or an error message if the operation fails.</returns>
        [Authorize]
        [HttpPost]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> CreateDataValidation([FromBody] CreateDataValidationRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _dataValidationService.CreateDataValidationAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }
        #endregion

        #region Put
        /// <summary>
        /// Updates an existing data validation. Use this endpoint to modify validation rules for a schema field.
        /// </summary>
        /// <param name="request">Updated data validation: ItemId (unique identifier), SchemaId, FieldName, Validations.</param>
        /// <returns>Returns the updated data validation or an error message if the operation fails.</returns>
        [Authorize]
        [HttpPut]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> UpdateDataValidation([FromBody] UpdateDataValidationRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _dataValidationService.UpdateDataValidationAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }
        #endregion

        #region Delete
        /// <summary>
        /// Cloud use only: Deletes a data validation by its unique ID.
        /// </summary>
        /// <param name="id">The unique identifier of the data validation to delete.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns a success response if the validation is deleted, or an error message if the operation fails.</returns>
        [Authorize]
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> DeleteDataValidation([FromRoute] string id, [FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_PROJECT_KEY" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.DeleteDataValidationAsync(id);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Deletes a data validation by its unique ID.
        /// </summary>
        /// <param name="validationId">The unique identifier of the data validation to delete.</param>
        /// <param name="projectKey">The project key for context.</param>
        /// <returns>Returns a success response if the validation is deleted, or an error message if the operation fails.</returns>
        [Authorize]
        [HttpDelete]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> DeleteDataValidationAsync([FromQuery] string validationId, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(validationId))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_VALIDATION_ID" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var response = await _dataValidationService.DeleteDataValidationAsync(validationId);
            return StatusCode(response.HttpStatusCode, response);
        }
        #endregion
    }
}
