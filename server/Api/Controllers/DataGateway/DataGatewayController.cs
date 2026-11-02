using System.Text.Json;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

/// <summary>
/// The Data Gateway's REST API: one set of routes for every entity (<c>/api/gateway/{entity}</c>), whatever its
/// schema. The controller only maps HTTP to <see cref="IGatewayRestService"/> and writes what it answers; the service
/// authenticates the caller, checks the entity's access level and runs the operation. There is no endpoint policy
/// here on purpose: an entity can be public, so the service decides per entity whether the caller must sign in.
/// A failure answers in the gateway's problem shape (<see cref="RestProblemFilterAttribute"/>), and a request body
/// is capped at <see cref="RestLimits.MaxRequestBodyBytes"/> (<see cref="RestRequestSizeLimitAttribute"/>).
/// </summary>
[ApiController]
[Route("gateway/{entity}")]
[RestRequestSizeLimit]
[RestProblemFilter]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status400BadRequest, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status401Unauthorized, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status403Forbidden, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status404NotFound, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status413PayloadTooLarge, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status415UnsupportedMediaType, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status500InternalServerError, RestActionResults.ProblemContentType)]
public class DataGatewayController(IGatewayRestService service) : ControllerBase
{
    /// <summary>Lists records. The query string takes <c>order</c>, <c>select</c>, <c>pageNo</c>, <c>pageSize</c> and <c>includeTotalCount</c>; a filter (<c>where</c>) needs the body form, <c>POST</c>.</summary>
    [HttpGet("")]
    [ProducesResponseType(typeof(RestListResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(string entity) =>
        Respond(await service.GetAsync(HttpContext, entity, null));

    /// <summary>Lists records, with the query as a JSON body: <c>where</c>, <c>order</c>, <c>select</c>, <c>paging</c>, <c>includeTotalCount</c>. The only list form that takes a filter.</summary>
    [HttpPost("")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestListResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(string entity, [FromBody] JsonElement body) =>
        Respond(await service.GetAsync(HttpContext, entity, body));

    /// <summary>Reads one record.</summary>
    [HttpGet("item/{itemId}")]
    public async Task<IActionResult> GetById(string entity, string itemId) =>
        Respond(await service.GetByIdAsync(HttpContext, entity, itemId));

    /// <summary>Inserts one record; 201 with its <c>Location</c>.</summary>
    [HttpPost("item")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Insert(string entity, [FromBody] JsonElement body) =>
        Respond(await service.InsertAsync(HttpContext, entity, body));

    /// <summary>Changes the fields the body names on one record.</summary>
    [HttpPatch("item/{itemId}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(string entity, string itemId, [FromBody] JsonElement body) =>
        Respond(await service.UpdateAsync(HttpContext, entity, itemId, body));

    /// <summary>Writes one record under the given id: updates it when it exists (200), inserts it otherwise (201).</summary>
    [HttpPut("item/{itemId}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Upsert(string entity, string itemId, [FromBody] JsonElement body) =>
        Respond(await service.UpsertAsync(HttpContext, entity, itemId, body));

    /// <summary>Deletes one record; soft unless <paramref name="hardDelete"/> is set.</summary>
    [HttpDelete("item/{itemId}")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Delete(string entity, string itemId, [FromQuery] bool hardDelete = false) =>
        Respond(await service.DeleteAsync(HttpContext, entity, itemId, hardDelete));

    /// <summary>Inserts many records.</summary>
    [HttpPost("items")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestBulkResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> InsertMany(string entity, [FromBody] JsonElement body) =>
        Respond(await service.InsertManyAsync(HttpContext, entity, body));

    /// <summary>Changes every record a <c>where</c> selects: <c>{ "where": {…}, "input": {…} }</c>.</summary>
    [HttpPatch("items")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestBulkResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateMany(string entity, [FromBody] JsonElement body) =>
        Respond(await service.UpdateManyAsync(HttpContext, entity, body));

    /// <summary>Deletes every record a <c>where</c> selects: <c>{ "where": {…} }</c>; soft unless <paramref name="hardDelete"/> is set.</summary>
    [HttpDelete("items")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestBulkResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteMany(string entity, [FromBody] JsonElement body, [FromQuery] bool hardDelete = false) =>
        Respond(await service.DeleteManyAsync(HttpContext, entity, body, hardDelete));

    private ObjectResult Respond(RestResult result)
    {
        if (result.Location is not null)
            Response.Headers.Location = result.Location;
        return RestActionResults.From(result);
    }
}
