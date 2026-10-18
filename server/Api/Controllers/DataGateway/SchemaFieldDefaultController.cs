using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers
{
    /// <summary>
    /// Default values of schema properties: filled in on insert when the property isn't sent.
    /// Served under <c>schemas</c>, next to the other schema endpoints.
    /// </summary>
    [Route("schemas")]
    [ApiController]
    public class SchemaFieldDefaultController : ControllerBase
    {
        private readonly ISchemaDefinitionService _schemaService;

        /// <summary>
        /// Initializes a new instance of the <see cref="SchemaFieldDefaultController"/> class.
        /// </summary>
        /// <param name="schemaService"></param>
        public SchemaFieldDefaultController(ISchemaDefinitionService schemaService)
        {
            _schemaService = schemaService;
        }

        /// <summary>
        /// Sets or clears one property's default value, applied on insert when the property isn't sent.
        /// A nested property is addressed by its full dotted path (e.g. Read.Roles). Takes effect after publish.
        /// </summary>
        /// <param name="request">SchemaId, FieldName, and DefaultValue (Kind Static/Template/Now, Value, Offset), or a null DefaultValue to clear it.</param>
        /// <returns>Success, or 400 with the reason (e.g. a template syntax error with its position).</returns>
        [HttpPost("field-default")]
        [ProtectedEndPoint("blocks-data::schema::save-schema-fields")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> SetFieldDefault([FromBody] SetFieldDefaultRequest request)
        {
            var response = await _schemaService.SetFieldDefaultAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
