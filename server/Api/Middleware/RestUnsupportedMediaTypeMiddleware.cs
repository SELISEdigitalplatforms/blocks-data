using System.Text.Json;
using Api.Controllers;
using DataGateway.Rest.Errors;
using Microsoft.Net.Http.Headers;

namespace Blocks.Data.Api.Middleware;

/// <summary>
/// Gives the empty answers the router gives under the REST routes (<c>/api/gateway/{entity}…</c>) the gateway's
/// problem body:
/// <list type="bullet">
/// <item>415: a POST, PATCH or PUT with a content type other than <c>application/json</c> never reaches the
/// controller: the <c>[Consumes]</c> metadata makes the router refuse it, before any filter could answer. No action
/// ran, so this also writes the request-log entry (spec 2026-11-04 §4);</item>
/// <item>404 <c>NOT_FOUND</c>: no route matches the path, e.g. an old <c>/item</c> URL or an entity name no schema
/// can have (spec 2026-11-04 §3.3, §3.4);</item>
/// <item>405 <c>METHOD_NOT_ALLOWED</c>: the path exists but not for this method, e.g. <c>PATCH /{entity}</c>; the
/// router's <c>Allow</c> header is kept.</item>
/// </list>
/// An answer that already has a body (the service's own problems) is left as it is. The GraphQL endpoint
/// (<c>/api/gateway</c> itself) and every other route are left as they are.
/// </summary>
public sealed class RestUnsupportedMediaTypeMiddleware(RequestDelegate next)
{
    /// <summary>
    /// The SPA fallback's route pattern: every path that does not look like a file, except those under the REST
    /// routes. Otherwise the fallback would answer an unmatched <c>GET</c> there with the SPA's page and a 200, hiding
    /// the router's 404. Case-insensitive, as routing is.
    /// </summary>
    public const string SpaFallbackPattern = "{*path:nonfile:regex(^(?!api/gateway/.))}";

    private const string RestRoutePrefix = "/api/gateway";
    private const string NotFoundDetail =
        "No REST route matches this path. Use /api/gateway/{entity}, /api/gateway/{entity}/{id} or POST /api/gateway/{entity}:{method}.";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        await next(context);

        var response = context.Response;
        if (response.HasStarted || response.ContentType is not null)
            return;
        if (!IsRestRoute(context.Request.Path))
            return;

        if (response.StatusCode == StatusCodes.Status415UnsupportedMediaType)
            RestProblemFilterAttribute.LogUnsupportedMediaType(context);

        var problem = response.StatusCode switch
        {
            StatusCodes.Status415UnsupportedMediaType => RestProblemFilterAttribute.UnsupportedMediaType(context),
            StatusCodes.Status404NotFound => GatewayProblemMapper.Problem(
                context, StatusCodes.Status404NotFound, GatewayProblemMapper.NotFoundCode, NotFoundDetail),
            StatusCodes.Status405MethodNotAllowed => GatewayProblemMapper.Problem(
                context, StatusCodes.Status405MethodNotAllowed, GatewayProblemMapper.MethodNotAllowedCode, MethodNotAllowedDetail(context)),
            _ => null,
        };
        if (problem is null)
            return;

        response.ContentType = RestActionResults.ProblemContentType;
        await JsonSerializer.SerializeAsync(response.Body, problem.Body, problem.Body!.GetType(), JsonOptions, context.RequestAborted);
    }

    private static string MethodNotAllowedDetail(HttpContext context)
    {
        var detail = $"The method '{context.Request.Method}' is not allowed on this route.";
        var allow = context.Response.Headers[HeaderNames.Allow].ToString();
        return string.IsNullOrEmpty(allow) ? detail : $"{detail} Allowed: {allow}.";
    }

    private static bool IsRestRoute(PathString path) =>
        path.StartsWithSegments(RestRoutePrefix, out var rest) && rest.HasValue && rest.Value != "/";
}
