using System.Text.Json;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;

namespace Api.Controllers;

/// <summary>
/// The Data Gateway's REST API: one set of routes for every entity, whatever its schema (spec 2026-11-04 §2):
/// standard methods on the collection <c>/api/gateway/{entity}</c> and the record <c>/api/gateway/{entity}/{id}</c>,
/// and custom methods, <c>POST /api/gateway/{entity}:{verb}</c>, for the operations that need a body and are not a
/// create or an update of one record. <c>{entity}</c> must pass the <see cref="SchemaNameRouteConstraint"/>, so a
/// segment with a ':' never reaches a standard method and a name no schema can have is a routing 404.
/// The controller only maps HTTP to <see cref="IGatewayRestService"/> and writes what it answers; the service
/// authenticates the caller, checks the entity's access level and runs the operation. There is no endpoint policy
/// here on purpose: an entity can be public, so the service decides per entity whether the caller must sign in.
/// A failure answers in the gateway's problem shape (<see cref="RestProblemFilterAttribute"/>), and a request body
/// is capped at <see cref="RestLimits.MaxRequestBodyBytes"/> (<see cref="RestRequestSizeLimitAttribute"/>).
/// </summary>
/// <remarks>
/// The entity is in each action's template rather than the controller's: the custom-method segment
/// <c>{entity}:{verb}</c> shares its segment with the entity, and an action template can only add segments after the
/// controller's. The final templates are the same either way, and keep the global <c>api</c> prefix.
/// </remarks>
[ApiController]
[Route("gateway")]
[RestRequestSizeLimit]
[RestProblemFilter]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status400BadRequest, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status401Unauthorized, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status403Forbidden, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status404NotFound, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status405MethodNotAllowed, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status413PayloadTooLarge, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status415UnsupportedMediaType, RestActionResults.ProblemContentType)]
[ProducesResponseType(typeof(GatewayProblem), StatusCodes.Status500InternalServerError, RestActionResults.ProblemContentType)]
public class DataGatewayController(IGatewayRestService service) : ControllerBase
{
    private const string Collection = "{entity:" + SchemaNameRouteConstraint.Name + "}";
    private const string Record = Collection + "/{itemId}";
    private const string CustomMethodTemplate = Collection + ":{verb}";
    private const string HardDeleteParameter = "hardDelete";
    private const int MaxEchoedVerbLength = 64;

    private static readonly DefaultModelBindingMessageProvider ModelBindingMessages = new();

    /// <summary>Lists records. The query string takes <c>order</c>, <c>select</c>, <c>pageNo</c>, <c>pageSize</c> and <c>includeTotalCount</c>; a filter (<c>where</c>) needs the body form, <c>POST /{entity}:query</c>.</summary>
    [HttpGet(Collection)]
    [ProducesResponseType(typeof(RestListResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(string entity) =>
        Respond(await service.GetAsync(HttpContext, entity, null));

    /// <summary>Inserts one record; 201 with its <c>Location</c>, <c>/api/gateway/{entity}/{id}</c>.</summary>
    [HttpPost(Collection)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Insert(string entity, [FromBody] JsonElement body) =>
        Respond(await service.InsertAsync(HttpContext, entity, body));

    /// <summary>Reads one record.</summary>
    [HttpGet(Record)]
    public async Task<IActionResult> GetById(string entity, string itemId) =>
        Respond(await service.GetByIdAsync(HttpContext, entity, itemId));

    /// <summary>Changes the fields the body names on one record.</summary>
    [HttpPatch(Record)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(string entity, string itemId, [FromBody] JsonElement body) =>
        Respond(await service.UpdateAsync(HttpContext, entity, itemId, body));

    /// <summary>Writes one record under the given id: updates it when it exists (200), inserts it otherwise (201).</summary>
    [HttpPut(Record)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Upsert(string entity, string itemId, [FromBody] JsonElement body) =>
        Respond(await service.UpsertAsync(HttpContext, entity, itemId, body));

    /// <summary>Deletes one record; soft unless <paramref name="hardDelete"/> is set.</summary>
    [HttpDelete(Record)]
    [ProducesResponseType(typeof(RestItemResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Delete(string entity, string itemId, [FromQuery] bool hardDelete = false) =>
        Respond(await service.DeleteAsync(HttpContext, entity, itemId, hardDelete));

    /// <summary>
    /// A custom method, by its <paramref name="verb"/> (exact, case included):
    /// <list type="bullet">
    /// <item><c>query</c>: lists records with the query as a JSON body: <c>where</c>, <c>order</c>, <c>select</c>, <c>paging</c>, <c>includeTotalCount</c>;</item>
    /// <item><c>insertMany</c>: inserts the records of a JSON array;</item>
    /// <item><c>updateMany</c>: changes every record a <c>where</c> selects: <c>{ "where": {…}, "input": {…} }</c>;</item>
    /// <item><c>deleteMany</c>: deletes every record a <c>where</c> selects: <c>{ "where": {…} }</c>; soft unless the query has <c>hardDelete=true</c>.</item>
    /// </list>
    /// Any other verb is a 400 <c>UNKNOWN_METHOD</c> problem, and runs nothing; it is written to the request log, as the
    /// action runs only for a request that bound.
    /// </summary>
    /// <remarks>
    /// <c>hardDelete</c> is read in the <c>deleteMany</c> arm only, not bound as a parameter: a parameter would refuse
    /// a bad value on every verb, even the unknown ones, before the verb is known.
    /// </remarks>
    [HttpPost(CustomMethodTemplate)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(RestListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RestBulkResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> CustomMethod(string entity, string verb, [FromBody] JsonElement body)
    {
        switch (verb)
        {
            case RestCustomMethods.Query:
                return Respond(await service.GetAsync(HttpContext, entity, body));
            case RestCustomMethods.InsertMany:
                return Respond(await service.InsertManyAsync(HttpContext, entity, body));
            case RestCustomMethods.UpdateMany:
                return Respond(await service.UpdateManyAsync(HttpContext, entity, body));
            case RestCustomMethods.DeleteMany:
                var modelState = new ModelStateDictionary();
                var hardDelete = ReadHardDelete(modelState);
                return modelState.IsValid
                    ? Respond(await service.DeleteManyAsync(HttpContext, entity, body, hardDelete))
                    : RestActionResults.From(RestProblemFilterAttribute.InvalidModel(HttpContext, modelState));
            default:
                var detail = RestCustomMethods.UnknownMethodDetail(EchoedVerb(verb));
                RestOperationLog.Refused(HttpContext, entity, RestRouteNames.UnknownOperationName(entity),
                    StatusCodes.Status400BadRequest, GatewayProblemMapper.UnknownMethodCode, detail);
                return Respond(GatewayProblemMapper.Problem(
                    HttpContext, StatusCodes.Status400BadRequest, GatewayProblemMapper.UnknownMethodCode, detail));
        }
    }

    /// <summary>
    /// The query's <c>hardDelete</c> as a <c>[FromQuery] bool</c> reads it: absent is <c>false</c>, the first value is
    /// taken, <c>true</c> and <c>false</c> in any case are accepted, and anything else (an empty value included) is a
    /// model-state error with the framework's own message, so the answer is the one <c>DELETE /{entity}/{id}</c> gives.
    /// </summary>
    private bool ReadHardDelete(ModelStateDictionary modelState)
    {
        var values = Request.Query[HardDeleteParameter];
        if (values.Count == 0)
            return false;

        var text = values[0] ?? string.Empty;
        if (bool.TryParse(text, out var hardDelete))
            return hardDelete;

        modelState.AddModelError(HardDeleteParameter, string.IsNullOrWhiteSpace(text)
            ? ModelBindingMessages.ValueMustNotBeNullAccessor(text)
            : ModelBindingMessages.NonPropertyAttemptedValueIsInvalidAccessor(text));
        return false;
    }

    /// <summary>
    /// The unknown verb as the problem detail and the log echo it: its first 64 characters, then "…". A surrogate pair
    /// across the cut is dropped whole, so the echo is never half a character.
    /// </summary>
    private static string EchoedVerb(string verb)
    {
        if (verb.Length <= MaxEchoedVerbLength)
            return verb;

        var length = char.IsHighSurrogate(verb[MaxEchoedVerbLength - 1]) ? MaxEchoedVerbLength - 1 : MaxEchoedVerbLength;
        return string.Concat(verb.AsSpan(0, length), "…");
    }

    private ObjectResult Respond(RestResult result)
    {
        if (result.Location is not null)
            Response.Headers.Location = result.Location;
        return RestActionResults.From(result);
    }
}
