using System.Text.Json.Serialization;

namespace DataGateway.Rest.Errors;

/// <summary>
/// The body of every REST error (<c>application/problem+json</c>, RFC 9457, plus the gateway's <c>code</c>):
/// <c>{ type, title, status, code, detail, errors?, traceId }</c>. <c>errors</c> is present only when the failure
/// belongs to fields.
/// </summary>
public sealed record GatewayProblem(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] int Status,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("detail")] string Detail,
    [property: JsonPropertyName("errors"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<GatewayProblemError>? Errors,
    [property: JsonPropertyName("traceId")] string? TraceId);

/// <summary>One field's failure: the field's path, what is wrong, and which rule refused it (e.g. <c>Unique</c>).</summary>
public sealed record GatewayProblemError(
    [property: JsonPropertyName("field")] string Field,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("validationType")] string ValidationType);
