using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers.DataGateway
{
    /// <summary>
    /// Controller for managing data access permissions.
    /// Provides endpoints to set data access permissions for different schemas.
    /// </summary>
    [Route("data-access")]
    [ApiController]
    public class DataAccessController : ControllerBase
    {
        private readonly IDataAccessService _dataAccessService;

        /// <summary>
        /// Initializes a new instance of the <see cref="DataAccessController"/> class.
        /// </summary>
        /// <param name="dataAccessService">The data access service.</param>
        public DataAccessController(IDataAccessService dataAccessService)
        {
            _dataAccessService = dataAccessService ?? throw new ArgumentNullException(nameof(dataAccessService));
        }

        /// <summary>
        /// Configures the security for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("security/change")]
        [ProtectedEndPoint("blocks-data::configure-security")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ConfigureSecurity([FromBody] ConfigureSchemaSecurityRequest request)
        {
            var response = await _dataAccessService.ConfigureSecurityAsync(request);
            return StatusCode(response.HttpStatusCode, response);

        }


        /// <summary>
        /// Creates a data access policy for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("policy/create")]
        [ProtectedEndPoint("blocks-data::create-data-access-policy")]
        public async Task<IActionResult> CreateDataAccessPolicy([FromBody] CreateDataAccessPolicyRequest request)
        {
            var response = await _dataAccessService.CreateDataAccessPolicyAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Updates a data access policy for a specific item.
        /// </summary>
        /// <param name="request"></param>
        /// <returns>Returns the result of the update operation.</returns>
        [HttpPost("policy/update")]
        [ProtectedEndPoint("blocks-data::update-data-access-policy")]
        public async Task<IActionResult> UpdateDataAccessPolicy([FromBody] UpdateDataAccessPolicyRequest request)
        {
            var response = await _dataAccessService.UpdateDataAccessPolicyAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Deletes a data access policy for a specific item.
        /// </summary>
        /// <param name="itemId"></param>
        /// <returns>Returns the result of the delete operation.</returns>
        [HttpDelete("policy/delete")]
        [ProtectedEndPoint("blocks-data::delete-data-access-policy")]
        public async Task<IActionResult> DeleteDataAccessPolicy([FromQuery] string itemId)
        {
            if (string.IsNullOrWhiteSpace(itemId))
                return StatusCode(400, new { Message = "INVALID_ITEM_ID" });
            var response = await _dataAccessService.DeleteDataAccessPolicyAsync(itemId);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Gets all data access policies for a specific schema.
        /// </summary>
        /// <param name="schemaName"></param>
        /// <returns></returns>
        [HttpGet("policy/get")]
        [ProtectedEndPoint("blocks-data::get-data-access-policy")]
        public async Task<IActionResult> GetDataAccessPolicy([FromQuery] string schemaName)
        {
            if (string.IsNullOrWhiteSpace(schemaName))
                return StatusCode(400, new { Message = "INVALID_SCHEMA_NAME" });

            var response = await _dataAccessService.GetEntityDataAccessPolicyAsync(schemaName);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
