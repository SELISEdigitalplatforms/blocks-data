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
    /// OperateSchemaController is responsible for managing schema operations.
    /// It provides endpoints to reload the GraphQL schema configuration, which is necessary after making changes to schema definitions or data sources.
    /// </summary>
    [Route("schemas")]
    [ApiController]
    public class SchemaController : ControllerBase
    {
        private const string InvalidProjectKeyMessage = "INVALID_PROJECT_KEY";
        private readonly ISchemaDefinitionService _schemaService;
        private readonly ISchemaChangeLogService _schemaChangeLogService;
        /// <summary>
        /// Initializes a new instance of the <see cref="SchemaController"/> class.
        /// </summary>
        /// <param name="schemaService"></param>
        /// <param name="schemaChangeLogService"></param>
        public SchemaController(ISchemaDefinitionService schemaService, ISchemaChangeLogService schemaChangeLogService)
        {
            _schemaService = schemaService;
            _schemaChangeLogService = schemaChangeLogService;
        }

        #region Get
        /// <summary>
        /// Retrieves a paginated list of all schema definitions. Use this endpoint to view all available schemas, optionally filtered by a keyword.
        /// </summary>
        /// <param name="request">Request parameters for pagination and filtering: Keyword (search term), PageNo, PageSize, SortBy, SortDescending.</param>
        /// <returns>Returns a paginated list of schema definitions.</returns>
        [HttpGet]
        [ProtectedEndPoint("blocks-data::schema::get-schema-definitions")]
        [ProducesResponseType(typeof(ServiceResponse<PaginationResponse<SchemaDefinitionResponse>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetSchemaDefinitions([FromQuery] GetSchemaDefinitionListRequest request)
        {
            var schemas = await _schemaService.GetAllSchemasAsync(request);

            return Ok(new ServiceResponse<PaginationResponse<SchemaDefinitionResponse>>().SetSuccess(schemas));
        }

        /// <summary>
        /// Retrieves a paginated list of schema definitions along with an aggregation summary of access levels (Public, User, Custom) for Read, Write, Edit, and Delete operations.
        /// </summary>
        /// <param name="request">Request parameters for pagination and filtering.</param>
        /// <returns>Returns a paginated list of schema definitions and an aggregation of access-level counts.</returns>
        [HttpGet("aggregation")]
        [ProtectedEndPoint("blocks-data::schema::get-schema-definitions-summary")]
        [ProducesResponseType(typeof(ServiceResponse<SchemaDefinitionListResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetSchemaDefinitionsSummary([FromQuery] GetSchemaDefinitionListRequest request)
        {
            var schemas = await _schemaService.GetAllSchemasAsync(request);
            var aggregationResponse = await _schemaService.GetSchemaAggregationAsync();

            var result = new SchemaDefinitionListResponse
            {
                Schemas = schemas,
                Aggregation = aggregationResponse.Data ?? new()
            };

            return Ok(new ServiceResponse<SchemaDefinitionListResponse>().SetSuccess(result));
        }

        /// <summary>
        /// Retrieves the details of a specific schema definition by its unique ID. Use this endpoint to get the schema definition details, including its fields and type.
        /// </summary>
        /// <param name="id">The unique identifier of the schema definition to retrieve.</param>
        /// <returns>Returns the schema definition details if found, or an error message if not found.</returns>
        [HttpGet("get-by-id")]
        [ProtectedEndPoint("blocks-data::schema::get-schema-definition-by-id")]
        [ProducesResponseType(typeof(ServiceResponse<SchemaDefinitionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetSchemaDefinitionByIdAsync([FromQuery] string id)
        {
            if (string.IsNullOrWhiteSpace(id))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_ID" });

            var response = await _schemaService.GetSchemaByIdAsync(id);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Gets all unadapted schema change logs.
        /// </summary>
        /// <returns></returns>
        [HttpGet("unadapted-change-logs")]
        [ProtectedEndPoint("blocks-data::schema::get-unadapted-change-logs")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetUnadaptedSchemaChangeLogs()
        {
            var response = await _schemaChangeLogService.GetUnadaptedSchemaChangeLogsAsync();
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Retrieves a list of all Entity-type schema collections with basic info.
        /// </summary>
        [HttpGet("info")]
        [ProtectedEndPoint("blocks-data::schema::get-entity-collections")]
        [ProducesResponseType(typeof(ServiceResponse<CollectionListResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetEntityCollections([FromQuery] string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = InvalidProjectKeyMessage });

            var response = await _schemaService.GetEntityCollectionsAsync();
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Retrieves the details of a specific Entity-type schema by its collection name, including all fields.
        /// </summary>
        [HttpGet("info-by-name")]
        [ProtectedEndPoint("blocks-data::schema::get-entity-collection-by-name")]
        [ProducesResponseType(typeof(ServiceResponse<CollectionDetailResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> GetEntityCollectionByNameAsync([FromQuery] string schemaName)
        {
            if (string.IsNullOrWhiteSpace(schemaName))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_NAME" });

            var response = await _schemaService.GetEntityCollectionByNameAsync(schemaName);
            return StatusCode(response.HttpStatusCode, response);
        }


        #endregion

        #region Post
        /// <summary>
        /// Creates a new schema definition. Use this endpoint to define a new schema, including its name, collection name, fields, and type.
        /// </summary>
        /// <param name="request">Schema definition details: SchemaName, CollectionName, Fields (list of Name, Type, IsArray), SchemaType (Entity or Dto).</param>
        /// <returns>Returns the created schema definition or an error message if the operation fails.</returns>
        [HttpPost("define")]
        [ProtectedEndPoint("blocks-data::schema::create-schema-definition")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> CreateSchemaDefinition([FromBody] CreateSchemaDefinitionRequest request)
        {
            var response = await _schemaService.CreateSchemaDefinitionAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Saves field definitions for a schema. Use this endpoint to add or update fields in an existing schema.
        /// </summary>
        /// <param name="request">Field definitions to be saved: ItemId (schema identifier), Fields (list of field definitions).</param>
        /// <returns>Returns a success response if the fields are saved, or an error message if the operation fails.</returns>
        [HttpPost("info")]
        [ProtectedEndPoint("blocks-data::schema::create-schema")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> CreateSchema([FromBody] CreateSchemaRequest request)
        {
            var response = await _schemaService.CreateSchemaAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Saves field definitions for a schema. Use this endpoint to add or update fields in an existing schema.
        /// </summary>
        /// <param name="request">Field definitions to be saved: ItemId (schema identifier), Fields (list of field definitions).</param>
        /// <returns>Returns a success response if the fields are saved, or an error message if the operation fails.</returns>
        [HttpPost("fields")]
        [ProtectedEndPoint("blocks-data::schema::save-schema-fields")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> SaveSchemaFields([FromBody] SaveFieldDefinitionRequest request)
        {
            var response = await _schemaService.SaveFieldDefinitionAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }


        #endregion

        #region Put

        /// <summary>
        /// Updates an existing schema definition. Use this endpoint to modify the structure or fields of an existing schema.
        /// </summary>
        /// <param name="request">Updated schema definition: ItemId (unique identifier), SchemaName, CollectionName, Fields, SchemaType.</param>
        /// <returns>Returns the updated schema definition or an error message if the operation fails.</returns>
        [HttpPut("define")]
        [ProtectedEndPoint("blocks-data::schema::update-schema-definition")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> UpdateSchemaDefinition([FromBody] UpdateSchemaDefinitionRequest request)
        {
            var response = await _schemaService.UpdateSchemaDefinitionAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }

        /// <summary>
        /// Updates an existing schema definition. Use this endpoint to modify the structure or fields of an existing schema.
        /// </summary>
        /// <param name="request">Updated schema definition: ItemId (unique identifier), SchemaName, CollectionName, Fields, SchemaType.</param>
        /// <returns>Returns the updated schema definition or an error message if the operation fails.</returns>
        [HttpPut("info")]
        [ProtectedEndPoint("blocks-data::schema::update-schema")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> UpdateSchema([FromBody] UpdateSchemaRequest request)
        {
            var response = await _schemaService.UpdateSchemaAsync(request);
            return StatusCode(response.HttpStatusCode, response);
        }
        #endregion

        #region Delete

        /// <summary>
        /// Deletes a schema definition by its unique ID. This action cannot be undone.
        /// </summary>
        /// <param name="id">The unique identifier of the schema definition to delete.</param>
        /// <returns>Returns a success response if the schema is deleted, or an error message if the operation fails.</returns>
        [HttpDelete]
        [ProtectedEndPoint("blocks-data::schema::delete-schema-definition")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> DeleteSchemaDefinitionAsync([FromQuery] string id)
        {
            if (string.IsNullOrWhiteSpace(id))
                return StatusCode((int)HttpStatusCode.BadRequest, new { Message = "INVALID_SCHEMA_ID" });

            var response = await _schemaService.DeleteSchemaAsync(id);
            return StatusCode(response.HttpStatusCode, response);
        }

        #endregion
    }
}
