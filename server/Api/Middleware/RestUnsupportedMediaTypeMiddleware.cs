using System.Text.Json;
using Api.Controllers;
using DataGateway.Rest.Errors;

namespace Blocks.Data.Api.Middleware;

/// <summary>
/// Gives a 415 the router answers under the REST routes (<c>/api/gateway/{entity}…</c>) the gateway's problem body.
/// A POST, PATCH or PUT with a content type other than <c>application/json</c> never reaches the controller: the
/// <c>[Consumes]</c> metadata makes the router refuse it with an empty 415, before any filter could answer. The
/// GraphQL endpoint (<c>/api/gateway</c> itself) and every other route are left as they are.
/// </summary>
public sealed class RestUnsupportedMediaTypeMiddleware(RequestDelegate next)
{
    private const string RestRoutePrefix = "/api/gateway";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        await next(context);

        var response = context.Response;
        if (response.StatusCode != StatusCodes.Status415UnsupportedMediaType || response.HasStarted || response.ContentType is not null)
            return;
        if (!IsRestRoute(context.Request.Path))
            return;

        var problem = RestProblemFilterAttribute.UnsupportedMediaType(context);
        response.ContentType = RestActionResults.ProblemContentType;
        await JsonSerializer.SerializeAsync(response.Body, problem.Body, problem.Body!.GetType(), JsonOptions, context.RequestAborted);
    }

    private static bool IsRestRoute(PathString path) =>
        path.StartsWithSegments(RestRoutePrefix, out var rest) && rest.HasValue && rest.Value != "/";
}
