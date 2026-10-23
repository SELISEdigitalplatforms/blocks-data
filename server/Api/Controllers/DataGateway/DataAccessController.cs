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
        private readonly IAccessGrantGuard _guard;

        /// <summary>
        /// Initializes a new instance of the <see cref="DataAccessController"/> class.
        /// </summary>
        /// <param name="dataAccessService">The data access service.</param>
        /// <param name="guard">Access grant guard: only the system caller may write access.</param>
        public DataAccessController(IDataAccessService dataAccessService, IAccessGrantGuard guard)
        {
            _dataAccessService = dataAccessService ?? throw new ArgumentNullException(nameof(dataAccessService));
            _guard = guard ?? throw new ArgumentNullException(nameof(guard));
        }

        private ObjectResult? DenyUnlessSystemCaller(string action)
        {
            if (_guard.IsAllowed(action)) return null;
            var denied = new ServiceResponse<ActionResponse>()
                .SetErrorMessage(AccessGrantGuard.ErrorKey)
                .SetHttpStatusCode(StatusCodes.Status403Forbidden);
            return StatusCode(denied.HttpStatusCode, denied);
        }

        /// <summary>
        /// Configures the security for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("security/change")]
        [ProtectedEndPoint("blocks-data::data-access::configure-security")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ConfigureSecurity([FromBody] ConfigureSchemaSecurityRequest request)
        {
            var denied = DenyUnlessSystemCaller("security/change");
            if (denied is not null) return denied;

            var response = await _dataAccessService.ConfigureSecurityAsync(request);
            return StatusCode(response.HttpStatusCode, response);

        }


        /// <summary>
        /// Creates a data access policy for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("policy/create")]
        [ProtectedEndPoint("blocks-data::data-access::create-data-access-policy")]
        public async Task<IActionResult> CreateDataAccessPolicy([FromBody] CreateDataAccessPolicyRequest request)
        {
            var denied = DenyUnlessSystemCaller("policy/create");
            if (denied is not null) return denied;

            var response = await _dataAccessService.CreateDataAccessPolicyAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Updates a data access policy for a specific item.
        /// </summary>
        /// <param name="request"></param>
        /// <returns>Returns the result of the update operation.</returns>
        [HttpPost("policy/update")]
        [ProtectedEndPoint("blocks-data::data-access::update-data-access-policy")]
        public async Task<IActionResult> UpdateDataAccessPolicy([FromBody] UpdateDataAccessPolicyRequest request)
        {
            var denied = DenyUnlessSystemCaller("policy/update");
            if (denied is not null) return denied;

            var response = await _dataAccessService.UpdateDataAccessPolicyAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Deletes a data access policy for a specific item.
        /// </summary>
        /// <param name="itemId"></param>
        /// <returns>Returns the result of the delete operation.</returns>
        [HttpDelete("policy/delete")]
        [ProtectedEndPoint("blocks-data::data-access::delete-data-access-policy")]
        public async Task<IActionResult> DeleteDataAccessPolicy([FromQuery] string itemId)
        {
            var denied = DenyUnlessSystemCaller("policy/delete");
            if (denied is not null) return denied;

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
        [ProtectedEndPoint("blocks-data::data-access::get-data-access-policy")]
        public async Task<IActionResult> GetDataAccessPolicy([FromQuery] string schemaName)
        {
            if (string.IsNullOrWhiteSpace(schemaName))
                return StatusCode(400, new { Message = "INVALID_SCHEMA_NAME" });

            var response = await _dataAccessService.GetEntityDataAccessPolicyAsync(schemaName);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
