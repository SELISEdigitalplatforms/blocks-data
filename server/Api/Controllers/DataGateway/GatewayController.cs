using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[Route("gateway/{schema}/records")]
[ApiController]
public class GatewayController : ControllerBase
{
    private readonly IGatewayQueryService _queryService;
    private readonly IGatewayMutationService _mutationService;
    private readonly ISchemaDefinitionRegistry _schemaRegistry;
    private readonly RestAccessControlService _accessControl;

    public GatewayController(
        IGatewayQueryService queryService,
        IGatewayMutationService mutationService,
        ISchemaDefinitionRegistry schemaRegistry,
        RestAccessControlService accessControl)
    {
        _queryService = queryService;
        _mutationService = mutationService;
        _schemaRegistry = schemaRegistry;
        _accessControl = accessControl;
    }

    [HttpGet]
    [ProducesResponseType(typeof(QueryResponse<Dictionary<string, object>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        string schema,
        [FromQuery] int? page,
        [FromQuery] int? perPage,
        [FromQuery] string? sort,
        [FromQuery] string? fields,
        [FromQuery] string? filter)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureReadAccess(schemaDef);

        var request = new GatewayQueryRequest
        {
            Page = page,
            PerPage = perPage,
            Sort = sort,
            Filter = filter,
            Fields = ParseFieldsList(fields)
        };

        var result = await _queryService.QueryAsync(request, schemaDef);
        return Ok(result);
    }

    [HttpPost("search")]
    [ProducesResponseType(typeof(QueryResponse<Dictionary<string, object>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        string schema,
        [FromBody] GatewayQueryRequest request)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureReadAccess(schemaDef);

        CoerceQueryRequest(request);
        var result = await _queryService.QueryAsync(request, schemaDef);
        return Ok(result);
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(Dictionary<string, object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetById(string schema, string id, [FromQuery] string? fields)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureReadAccess(schemaDef);

        var result = await _queryService.GetByIdAsync(id, ParseFieldsList(fields), schemaDef);
        if (result is null)
            return NotFound(new { status = 404, message = "Record not found." });

        return Ok(result);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ActionResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(
        string schema,
        [FromBody] Dictionary<string, object?> input)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureWriteAccess(schemaDef);

        var coerced = RestInputHelper.CoerceInput(input, schemaDef);
        var result = await _mutationService.InsertAsync(schemaDef, coerced);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPatch("{id}")]
    [ProducesResponseType(typeof(ActionResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(
        string schema,
        string id,
        [FromBody] Dictionary<string, object?> input)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureEditAccess(schemaDef);

        var coerced = RestInputHelper.CoerceInput(input, schemaDef);
        var result = await _mutationService.UpdateAsync(schemaDef, id, coerced);
        if (!result.Acknowledged && result.Message?.Contains("not found", StringComparison.OrdinalIgnoreCase) == true)
            return NotFound(new { status = 404, message = result.Message });

        return Ok(result);
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(
        string schema,
        string id,
        [FromQuery] bool hardDelete = false)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureDeleteAccess(schemaDef);

        var result = await _mutationService.DeleteAsync(schemaDef, id, hardDelete);
        if (!result.Acknowledged && result.Message?.Contains("not found", StringComparison.OrdinalIgnoreCase) == true)
            return NotFound(new { status = 404, message = result.Message });

        return NoContent();
    }

    [HttpPost("bulk-insert")]
    [ProducesResponseType(typeof(BulkActionResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> BulkInsert(
        string schema,
        [FromBody] GatewayBulkInsertRequest request)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureWriteAccess(schemaDef);

        var coercedItems = request.Items
            .Select(item => RestInputHelper.CoerceInput(item, schemaDef))
            .ToList();
        var result = await _mutationService.BulkInsertAsync(schemaDef, coercedItems);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPut("bulk-update")]
    [ProducesResponseType(typeof(ActionResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkUpdate(
        string schema,
        [FromBody] GatewayBulkUpdateRequest request)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureEditAccess(schemaDef);

        request.Where = RestInputHelper.CoerceObjectTree(request.Where);
        request.Input = RestInputHelper.CoerceInput(request.Input, schemaDef);
        var result = await _mutationService.BulkUpdateAsync(schemaDef, request);
        return Ok(result);
    }

    [HttpDelete("bulk-delete")]
    [ProducesResponseType(typeof(ActionResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkDelete(
        string schema,
        [FromBody] GatewayBulkDeleteRequest request)
    {
        var schemaDef = await ResolveSchemaOrNotFound(schema);
        EnsureDeleteAccess(schemaDef);

        request.Where = RestInputHelper.CoerceObjectTree(request.Where);
        var result = await _mutationService.BulkDeleteAsync(schemaDef, request);
        return Ok(result);
    }

    #region Private helpers

    private async Task<SchemaDefinitionExtended> ResolveSchemaOrNotFound(string schemaName)
    {
        var schemaDef = await _schemaRegistry.GetByNameAsync(schemaName);
        if (schemaDef is null)
            throw new EntityNotFoundException($"Schema '{schemaName}' not found.");
        return schemaDef;
    }

    private void EnsureReadAccess(SchemaDefinitionExtended schema) =>
        _accessControl.EnsureAccess(HttpContext, schema.ReadAccessLevel);

    private void EnsureWriteAccess(SchemaDefinitionExtended schema) =>
        _accessControl.EnsureAccess(HttpContext, schema.WriteAccessLevel);

    private void EnsureEditAccess(SchemaDefinitionExtended schema) =>
        _accessControl.EnsureAccess(HttpContext, schema.EditAccessLevel);

    private void EnsureDeleteAccess(SchemaDefinitionExtended schema) =>
        _accessControl.EnsureAccess(HttpContext, schema.DeleteAccessLevel);

    private static List<string>? ParseFieldsList(string? fields)
    {
        if (string.IsNullOrWhiteSpace(fields))
            return null;
        return fields.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }

    private static void CoerceQueryRequest(GatewayQueryRequest request)
    {
        request.Where = RestInputHelper.CoerceObjectTree(request.Where);
        request.Order = RestInputHelper.CoerceObjectTree(request.Order);
    }

    #endregion
}
