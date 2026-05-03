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
    /// 

    [Route("data-access")]
    [ApiController]
    public class DataAccessController : ControllerBase
    {
        private readonly IDataAccessService _dataAccessService;
        private readonly ChangeControllerContext _changeControllerContext;

        /// <summary>
        /// Initializes a new instance of the <see cref="DataAccessController"/> class.
        /// </summary>
        /// <param name="dataAccessService">The data access service.</param>
        /// <param name="changeControllerContext">The change Controller service.</param>
        public DataAccessController(IDataAccessService dataAccessService, ChangeControllerContext changeControllerContext)
        {
            _dataAccessService = dataAccessService ?? throw new ArgumentNullException(nameof(dataAccessService));
            _changeControllerContext = changeControllerContext ?? throw new ArgumentNullException(nameof(changeControllerContext));
        }

        /// <summary>
        /// Configures the security for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [Authorize]
        [HttpPost("security/change")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ConfigureSecurity([FromBody] ConfigureSchemaSecurityRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _dataAccessService.ConfigureSecurity(request);
            return StatusCode(response.HttpStatusCode, response);

        }


        /// <summary>
        /// Creates a data access policy for a specific schema.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [Authorize]
        [HttpPost("policy/create")]
        public async Task<IActionResult> CreateDataAccessPolicy([FromBody] CreateDataAccessPolicyRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _dataAccessService.CreateDataAccessPolicy(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Updates a data access policy for a specific item.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [Authorize]
        [HttpPost("policy/update")]
        public async Task<IActionResult> UpdateDataAccessPolicy([FromBody] UpdateDataAccessPolicyRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _dataAccessService.UpdateDataAccessPolicy(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Cloud use only: Deletes a data access policy for a specific item.
        /// </summary>
        /// <param name="itemId"></param>
        /// <param name="projectKey"></param>
        /// <returns></returns>
        [Authorize]
        [HttpDelete("policy/{itemId}/delete")]
        public async Task<IActionResult> DeleteDataAccessPolicy([FromRoute] string itemId, [FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode(400, new { Message = "INVALID_PROJECT_KEY" });
            _changeControllerContext.ChangeContext(new ProjectKeyModel
            {
                ProjectKey = projectKey
            });
            var response = await _dataAccessService.DeleteDataAccessPolicy(itemId, projectKey);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Deletes a data access policy for a specific item.
        /// </summary>
        /// <param name="itemId"></param>
        /// <param name="projectKey"></param>
        /// <returns></returns>
        [Authorize]
        [HttpDelete("policy/delete")]
        public async Task<IActionResult> DeleteDataAccessPolicyAsync([FromQuery] string itemId, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(itemId))
                return StatusCode(400, new { Message = "INVALID_ITEM_ID" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel
            {
                ProjectKey = projectKey
            });
            var response = await _dataAccessService.DeleteDataAccessPolicy(itemId, projectKey);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Cloud use only: Gets all data access policies for a specific schema.
        /// </summary>
        /// <param name="schemaName"></param>
        /// <param name="projectKey"></param>
        /// <returns></returns>
        [Authorize]
        [HttpGet("policy/{schemaName}/get")]
        public async Task<IActionResult> GetDataAccessPolicy([FromRoute] string schemaName, [FromQuery] string projectKey)
        {
            _changeControllerContext.ChangeContext(new ProjectKeyModel
            {
                ProjectKey = projectKey
            });
            var response = await _dataAccessService.GetEntityDataAccessPolicy(schemaName);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Gets all data access policies for a specific schema.
        /// </summary>
        /// <param name="schemaName"></param>
        /// <param name="projectKey"></param>
        /// <returns></returns>
        [Authorize]
        [HttpGet("policy/get")]
        public async Task<IActionResult> GetDataAccessPolicyAsync([FromQuery] string schemaName, string projectKey = "")
        {
            if (string.IsNullOrWhiteSpace(schemaName))
                return StatusCode(400, new { Message = "INVALID_SCHEMA_NAME" });

            _changeControllerContext.ChangeContext(new ProjectKeyModel
            {
                ProjectKey = projectKey
            });
            var response = await _dataAccessService.GetEntityDataAccessPolicy(schemaName);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
