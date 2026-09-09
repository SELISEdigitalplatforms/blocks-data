using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Api.Controllers
{
    /// <summary>
    /// SchemaIndexController manages MongoDB indexes defined on a schema's data collection:
    /// creating, listing, and deleting single-field or compound indexes.
    /// </summary>
    [Route("schemas/indexes")]
    [ApiController]
    public class SchemaIndexController : ControllerBase
    {
        private readonly ISchemaIndexService _schemaIndexService;

        /// <summary>
        /// Initializes a new instance of the <see cref="SchemaIndexController"/> class.
        /// </summary>
        /// <param name="schemaIndexService"></param>
        public SchemaIndexController(ISchemaIndexService schemaIndexService)
        {
            _schemaIndexService = schemaIndexService;
        }

        /// <summary>
        /// Retrieves every index defined on a schema.
        /// </summary>
        /// <param name="schemaDefinitionItemId">The unique identifier of the schema definition.</param>
        [HttpGet]
        [ProtectedEndPoint("blocks-data::schema::get-schema-indexes")]
        [ProducesResponseType(typeof(ServiceResponse<SchemaIndexListResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> GetSchemaIndexes([FromQuery] string schemaDefinitionItemId)
        {
            if (string.IsNullOrWhiteSpace(schemaDefinitionItemId))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_ID" });

            var response = await _schemaIndexService.GetIndexesAsync(schemaDefinitionItemId);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Creates a new index (single-field or compound) on an Entity-type schema's data collection.
        /// </summary>
        /// <param name="request">SchemaDefinitionItemId, ordered Fields (FieldName, Direction), and IsUnique.</param>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::schema::create-schema-index")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        public async Task<IActionResult> CreateSchemaIndex([FromBody] CreateSchemaIndexRequest request)
        {
            var response = await _schemaIndexService.CreateIndexAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Deletes a schema index by its unique ID. This drops the underlying MongoDB index as well.
        /// </summary>
        /// <param name="itemId">The unique identifier of the schema index to delete.</param>
        [HttpDelete]
        [ProtectedEndPoint("blocks-data::schema::delete-schema-index")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteSchemaIndex([FromQuery] string itemId)
        {
            if (string.IsNullOrWhiteSpace(itemId))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_INDEX_ID" });

            var response = await _schemaIndexService.DeleteIndexAsync(itemId);
            return StatusCode(response.HttpStatusCode, response);
        }
    }
}
