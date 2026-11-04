using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models.Constants;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace Api.Controllers;

/// <summary>Writes a <see cref="RestResult"/> the way every REST answer goes out: its status and body, and the problem media type for an error.</summary>
internal static class RestActionResults
{
    public const string JsonContentType = "application/json";
    public const string ProblemContentType = "application/problem+json";

    public static ObjectResult From(RestResult result)
    {
        var written = new ObjectResult(result.Body) { StatusCode = result.StatusCode };
        written.ContentTypes.Add(result.Body is GatewayProblem ? ProblemContentType : JsonContentType);
        return written;
    }
}

/// <summary>
/// Caps the request body at <see cref="RestLimits.MaxRequestBodyBytes"/>. A resource filter, because the limit comes
/// from configuration and an attribute argument must be a constant. It runs before the body is read; a body over the
/// limit makes Kestrel fail the read with a 413 <see cref="BadHttpRequestException"/>, which
/// <see cref="RestProblemFilterAttribute"/> answers as a problem.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RestRequestSizeLimitAttribute : Attribute, IResourceFilter
{
    /// <inheritdoc />
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        // Kestrel makes the limit read-only once the body has started to be read; there is nothing to set then.
        var feature = context.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false })
            feature.MaxRequestBodySize = Limits(context.HttpContext).MaxRequestBodyBytes;
    }

    /// <inheritdoc />
    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }

    internal static RestLimits Limits(HttpContext http) =>
        http.RequestServices?.GetService(typeof(IOptions<RestLimits>)) is IOptions<RestLimits> options ? options.Value : new RestLimits();
}

/// <summary>
/// Answers in the gateway's problem shape (<c>{ type, title, status, code, detail, errors?, traceId }</c>) wherever
/// the framework would answer in its own, for the actions of the controller it is on and for no other controller:
/// <list type="bullet">
/// <item>a model-binding failure (an empty or malformed body, a query value that is not a bool) is a 400
/// <c>VALIDATION_ERROR</c>; this runs ahead of the one <c>[ApiController]</c> adds, so that one never answers;</item>
/// <item>a body that is not <c>application/json</c> (a missing content type, which <c>[Consumes]</c> refuses in the
/// action pipeline) is a 415 <c>UNSUPPORTED_MEDIA_TYPE</c>; a wrong one is refused earlier, by the router, and
/// <see cref="Blocks.Data.Api.Middleware.RestUnsupportedMediaTypeMiddleware"/> gives that the same body;</item>
/// <item>an exception goes through <see cref="GatewayProblemMapper"/>; a body over the size limit is a 413
/// <c>PAYLOAD_TOO_LARGE</c> and any other unreadable body a 400.</item>
/// </list>
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class RestProblemFilterAttribute : Attribute, IActionFilter, IAlwaysRunResultFilter, IExceptionFilter, IOrderedFilter
{
    private const string BodyField = "body";
    private const string InvalidJsonMessage = "The request body is not valid JSON.";
    private const string InvalidValueMessage = "The value is not valid.";

    /// <summary>Ahead of the model-state and client-error filters <c>[ApiController]</c> adds (both at -2000).</summary>
    public int Order => -3000;

    // ---- model-binding failures ----

    /// <inheritdoc />
    public void OnActionExecuting(ActionExecutingContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (context.ModelState.IsValid)
            return;

        context.Result = RestActionResults.From(InvalidModel(context.HttpContext, context.ModelState));
    }

    /// <summary>The 400 <c>VALIDATION_ERROR</c> problem for a model-state with errors: one field error per message.</summary>
    internal static RestResult InvalidModel(HttpContext http, ModelStateDictionary modelState)
    {
        var errors = new List<GatewayFieldError>();
        foreach (var (key, entry) in modelState)
        {
            // An empty key is the body as a whole. The JSON input formatter reports a parse failure at a "$" path and
            // keeps only the parser's text (a position and a token), so that text is replaced, not passed on.
            var inBody = key.Length == 0 || key.StartsWith('$');
            var field = inBody ? BodyField : key;
            foreach (var error in entry.Errors)
            {
                var message = key.StartsWith('$') || error.Exception is JsonException
                    ? InvalidJsonMessage
                    : string.IsNullOrWhiteSpace(error.ErrorMessage) ? InvalidValueMessage : error.ErrorMessage;
                errors.Add(new GatewayFieldError(field, message, GatewayProblemMapper.InvalidValueType));
            }
        }

        return GatewayProblemMapper.Problem(
            http, StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode,
            "The request is not valid.", errors);
    }

    /// <inheritdoc />
    public void OnActionExecuted(ActionExecutedContext context)
    {
    }

    // ---- wrong content type ----

    /// <inheritdoc />
    public void OnResultExecuting(ResultExecutingContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (context.Result is not StatusCodeResult { StatusCode: StatusCodes.Status415UnsupportedMediaType })
            return;
        LogUnsupportedMediaType(context.HttpContext);
        context.Result = RestActionResults.From(UnsupportedMediaType(context.HttpContext));
    }

    /// <inheritdoc />
    public void OnResultExecuted(ResultExecutedContext context)
    {
    }

    private const string UnsupportedMediaTypeDetail =
        $"The request body must be sent as '{RestActionResults.JsonContentType}'; set the Content-Type header.";

    internal static RestResult UnsupportedMediaType(HttpContext http) =>
        GatewayProblemMapper.Problem(
            http, StatusCodes.Status415UnsupportedMediaType, GatewayProblemMapper.UnsupportedMediaTypeCode, UnsupportedMediaTypeDetail);

    /// <summary>
    /// Writes the request-log entry of a refused wrong content type: the operation the route would have run, or
    /// <c>unknown{Entity}</c> when that cannot be told (spec 2026-11-04 §4). No action ran, so nothing else logs it.
    /// </summary>
    internal static void LogUnsupportedMediaType(HttpContext http)
    {
        var request = http.Request;
        RestOperationLog.Refused(
            http, RestRouteNames.EntityFor(request.Path.Value ?? string.Empty),
            RestRouteNames.OperationFor(request.Method, request.Path.Value ?? string.Empty),
            StatusCodes.Status415UnsupportedMediaType, GatewayProblemMapper.UnsupportedMediaTypeCode, UnsupportedMediaTypeDetail);
    }

    // ---- exceptions ----

    /// <inheritdoc />
    public void OnException(ExceptionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var http = context.HttpContext;
        // The caller went away: nobody to answer, and not a fault to log.
        if (context.Exception is OperationCanceledException && http.RequestAborted.IsCancellationRequested)
            return;

        var result = context.Exception is BadHttpRequestException bad
            ? FromUnreadableBody(bad, http)
            : GatewayProblemMapper.Map(context.Exception, http);

        if (result.StatusCode >= StatusCodes.Status500InternalServerError)
        {
            var logger = (http.RequestServices?.GetService(typeof(ILoggerFactory)) as ILoggerFactory)?.CreateLogger<RestProblemFilterAttribute>();
            logger?.LogError(context.Exception, "A REST request failed unexpectedly");
        }

        context.Result = RestActionResults.From(result);
        context.ExceptionHandled = true;
    }

    /// <summary>
    /// Kestrel (or the server below it) refused to read the body: over the size limit is 413, anything else about the
    /// body (cut short, timed out) is the caller's 400. The server's own message is not repeated.
    /// </summary>
    private static RestResult FromUnreadableBody(BadHttpRequestException bad, HttpContext http) => bad.StatusCode switch
    {
        StatusCodes.Status413PayloadTooLarge => GatewayProblemMapper.Problem(
            http, StatusCodes.Status413PayloadTooLarge, GatewayProblemMapper.PayloadTooLargeCode,
            $"The request body is larger than the {RestRequestSizeLimitAttribute.Limits(http).MaxRequestBodyBytes} bytes allowed."),
        >= StatusCodes.Status400BadRequest and < StatusCodes.Status500InternalServerError => GatewayProblemMapper.Problem(
            http, bad.StatusCode, GraphQlConstant.ValidationErrorErrorCode, "The request body could not be read."),
        _ => GatewayProblemMapper.Map(bad, http),
    };
}
