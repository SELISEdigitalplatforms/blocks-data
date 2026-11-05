using DataGateway.DomainService.Gateway;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// A request the REST API cannot accept as sent: an unknown parameter, field or operator, a value of the wrong type,
/// a limit exceeded. It becomes a 400 <c>VALIDATION_ERROR</c>. <see cref="Errors"/> names the offending field when
/// the problem belongs to one.
/// </summary>
public sealed class RestRequestException(string message, IReadOnlyList<GatewayFieldError>? errors = null) : Exception(message)
{
    /// <summary>Per-field failures, or null when the problem is with the request as a whole.</summary>
    public IReadOnlyList<GatewayFieldError>? Errors { get; } = errors;

    /// <summary>A failure that belongs to one field: the message is both the exception's and the field error's.</summary>
    internal static RestRequestException ForField(string field, string message, string validationType)
        => new(message, [new GatewayFieldError(field, message, validationType)]);
}
