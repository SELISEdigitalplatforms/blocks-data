using System.Diagnostics;
using System.Text.Json;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models.Constants;
using DataGateway.Rest.Parsing;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;

namespace DataGateway.Rest.Errors;

/// <summary>
/// Turns a failure into the REST answer (spec §6.8), in one place: the gateway's codes keep their meaning
/// (<c>AUTH_NOT_AUTHENTICATED</c> 401, <c>FORBIDDEN</c> 403, <c>NOT_FOUND</c> 404, <c>VALIDATION_ERROR</c> 400, or
/// 409 when every field error is a uniqueness one); a request the REST layer cannot read is a 400; anything else is a
/// 500 with a generic detail, so no exception text (a database message, a connection string) reaches the caller.
/// </summary>
public static class GatewayProblemMapper
{
    public const string NotFoundCode = "NOT_FOUND";
    public const string InternalErrorCode = "INTERNAL_ERROR";
    public const string UnsupportedMediaTypeCode = "UNSUPPORTED_MEDIA_TYPE";
    public const string PayloadTooLargeCode = "PAYLOAD_TOO_LARGE";

    /// <summary>The <c>validationType</c> of a field error for a value (or a whole body) the request carried wrongly.</summary>
    public const string InvalidValueType = FieldPaths.InvalidValueType;

    private const string UniqueValidationType = "Unique";
    private const string ProblemType = "about:blank";
    private const string InternalErrorDetail = "An unexpected error occurred. Quote the traceId when reporting it.";
    private const string ConverterNamespace = "DataGateway.DomainService.Conversion";

    public static RestResult Map(Exception ex, HttpContext http)
    {
        ArgumentNullException.ThrowIfNull(ex);
        var (status, code, detail, errors) = Classify(ex);
        return Problem(http, status, code, detail, errors);
    }

    /// <summary>A problem answer built directly, for a refusal that is not an exception (e.g. the controller's 415).</summary>
    public static RestResult Problem(HttpContext http, int status, string code, string detail, IReadOnlyList<GatewayFieldError>? errors = null)
    {
        var problemErrors = errors is { Count: > 0 }
            ? errors.Select(e => new GatewayProblemError(e.Field, e.Message, e.ValidationType)).ToList()
            : null;
        var problem = new GatewayProblem(ProblemType, ReasonPhrases.GetReasonPhrase(status), status, code, detail, problemErrors, TraceId(http));
        return new RestResult(status, problem);
    }

    /// <summary>The status, code, detail and field errors a failure is answered with.</summary>
    internal static (int Status, string Code, string Detail, IReadOnlyList<GatewayFieldError>? Errors) Classify(Exception ex) => ex switch
    {
        GatewayException gateway => FromGateway(gateway),
        RestRequestException request => (StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode, request.Message, request.Errors),
        JsonException => (StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode, "The request body is not valid JSON.", null),
        // System.Text.Json reports a value it cannot read as asked (invalid UTF-16 text, the wrong kind) this way.
        InvalidOperationException when ThrownIn(ex, typeof(JsonElement).Assembly) =>
            (StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode, "The request body could not be read.", null),
        InvalidWhereFilterException where => (StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode, where.Message, null),
        // The where/order converters refuse what the request asked for with a plain ArgumentException and a message
        // written for the caller. Any other ArgumentException is a fault, not the caller's.
        ArgumentException argument when ThrownInConverters(argument) =>
            (StatusCodes.Status400BadRequest, GraphQlConstant.ValidationErrorErrorCode, argument.Message, null),
        _ => Internal(),
    };

    private static (int, string, string, IReadOnlyList<GatewayFieldError>?) FromGateway(GatewayException ex) => ex.Code switch
    {
        GraphQlConstant.UnauthorizedErrorCode => (StatusCodes.Status401Unauthorized, ex.Code, ex.Message, ex.FieldErrors),
        GraphQlConstant.ForbiddenErrorCode => (StatusCodes.Status403Forbidden, ex.Code, ex.Message, ex.FieldErrors),
        NotFoundCode => (StatusCodes.Status404NotFound, ex.Code, ex.Message, ex.FieldErrors),
        GraphQlConstant.ValidationErrorErrorCode when AllUnique(ex.FieldErrors) => (StatusCodes.Status409Conflict, ex.Code, ex.Message, ex.FieldErrors),
        GraphQlConstant.ValidationErrorErrorCode => (StatusCodes.Status400BadRequest, ex.Code, ex.Message, ex.FieldErrors),
        _ => Internal(),
    };

    private static (int, string, string, IReadOnlyList<GatewayFieldError>?) Internal() =>
        (StatusCodes.Status500InternalServerError, InternalErrorCode, InternalErrorDetail, null);

    private static bool AllUnique(IReadOnlyList<GatewayFieldError>? errors) =>
        errors is { Count: > 0 } && errors.All(e => e.ValidationType == UniqueValidationType);

    private static bool ThrownIn(Exception ex, System.Reflection.Assembly assembly) =>
        ex.TargetSite?.DeclaringType?.Assembly == assembly;

    private static bool ThrownInConverters(ArgumentException ex) =>
        ex.GetType() == typeof(ArgumentException)
        && ex.TargetSite?.DeclaringType?.Namespace == ConverterNamespace;

    /// <summary>The W3C trace id of the request's activity, so a caller's report finds the trace; else the request's own id.</summary>
    private static string? TraceId(HttpContext? http)
    {
        var activity = Activity.Current;
        if (activity is { IdFormat: ActivityIdFormat.W3C })
            return activity.TraceId.ToString();
        return http?.TraceIdentifier;
    }
}
