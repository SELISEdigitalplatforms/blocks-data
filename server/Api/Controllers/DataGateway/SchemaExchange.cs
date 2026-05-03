using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Api.Controllers.DataGateway
{
    /// <summary>
    /// Controller for schema import and export operations.
    /// </summary>
    [Route("schema-exchange")]
    [ApiController]
    public class SchemaExchangeController : ControllerBase
    {
        private readonly ISchemaExportService _schemaExportService;
        private readonly ISchemaImportService _schemaImportService;
        private readonly ChangeControllerContext _changeControllerContext;

        public SchemaExchangeController(
            ISchemaExportService schemaExportService,
            ISchemaImportService schemaImportService,
            ChangeControllerContext changeControllerContext)
        {
            _schemaExportService = schemaExportService;
            _schemaImportService = schemaImportService;
            _changeControllerContext = changeControllerContext;
        }

        /// <summary>
        /// Initiates an async export of all schema definitions for a project.
        /// Returns immediately with the fileId. The exported JSON file is delivered via notification using MessageCoRelationId.
        /// </summary>
        /// <param name="request">Export options: ProjectKey, MessageCoRelationId, ExportOptions (Schema | AccessPolicies | ValidationRules | All).</param>
        /// <returns>Returns Acknowledged=true and the fileId that can be used to download the exported file.</returns>
        [Authorize]
        [HttpPost("export")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ExportSchemas([FromBody] ExportSchemaRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _schemaExportService.InitiateExportAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Initiates an async import of schema definitions from a previously exported file.
        /// The FileId must reference a file uploaded to blob storage via an export operation.
        /// Returns immediately with acknowledgement. Import result is delivered via notification using MessageCoRelationId.
        /// </summary>
        /// <param name="request">Import parameters: ProjectKey, FileId of the exported schema file, MessageCoRelationId.</param>
        /// <returns>Returns Acknowledged=true when the import has been queued.</returns>
        [Authorize]
        [HttpPost("import")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> ImportSchemas([FromBody] ImportSchemaRequest request)
        {
            _changeControllerContext.ChangeContext(request);
            var response = await _schemaImportService.InitiateImportAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
