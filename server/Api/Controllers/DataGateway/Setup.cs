using Blocks.Genesis;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using Microsoft.AspNetCore.Authorization;

namespace Api.Controllers
{
    /// <summary>
    /// SetupController is responsible for managing setup operations.
    /// It provides endpoints to setup the database schema.
    /// </summary>
    [ApiExplorerSettings(IgnoreApi = true)]
    [Route("setup")]
    [ApiController]
    public class SetupController : ControllerBase
    {
        private readonly ISchemaDefinitionService _schemaService;
        private readonly IProjectService _projectService;
        private readonly ChangeControllerContextAdapter _changeControllerContext;

        /// <summary>
        /// Initializes a new instance of the <see cref="SetupController"/> class.
        /// </summary>
        /// <param name="schemaService"></param>
        /// <param name="projectService"></param>
        /// <param name="changeControllerContext"></param>
        public SetupController(ISchemaDefinitionService schemaService, IProjectService projectService, ChangeControllerContextAdapter changeControllerContext)
        {
            _schemaService = schemaService;
            _projectService = projectService;
            _changeControllerContext = changeControllerContext;
        }

        // exclude from swagger
#pragma warning disable CS1591
        /// <summary>
        /// Resets the schema for a project.
        /// </summary>
        /// <param name="projectKey">The unique identifier of the project to reset.</param>
        /// <param name="pageNo">The page number to reset.</param>
        /// <param name="pageSize">The page size to reset.</param>
        /// <returns></returns>
        [Authorize]
        [HttpPost("schema/reset")]
        [ProducesResponseType(typeof(ServiceResponse<Dictionary<string, Dictionary<string, bool>>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ResetSchema(string projectKey = "", int pageNo = 1, int pageSize = 10)
        {
            Console.WriteLine($"Resetting schema for project: {projectKey}");
            var tenants = await _projectService.GetTenantsAsync(projectKey);
            var tenantIds = tenants.Select(tenant => tenant.TenantId).ToList();
            var result = new Dictionary<string, Dictionary<string, bool>>();
            var projectKeyModel = new ProjectKeyModel
            {
                ProjectKey = projectKey
            };
            Console.WriteLine($"total tenants: {tenantIds.Count}");
            foreach (var tenantId in tenantIds)
            {
                Console.WriteLine($"Resetting schema for tenant: {tenantId}");
                projectKeyModel.ProjectKey = tenantId;
                _changeControllerContext.ChangeToAnyContext(projectKeyModel);
                Console.WriteLine($"tenant changed to: {tenantId}");
                var response = await _schemaService.ResetSchemaStructureAsync(pageNo, pageSize);
                if (result.ContainsKey(tenantId))
                {
                    result[tenantId] = response;
                }
                else
                {
                    result.Add(tenantId, response);
                }
                Console.WriteLine($"Schema reset for tenant: {tenantId} completed");
            }
            Console.WriteLine($"total tenants: {tenantIds.Count}, total resetted: {result.Count}");
            Console.WriteLine($"Schema reset for project: {projectKey} completed");
            return StatusCode(StatusCodes.Status200OK, new ServiceResponse<Dictionary<string, Dictionary<string, bool>>>().SetSuccess(result));
        }
#pragma warning restore CS1591
    }
}
