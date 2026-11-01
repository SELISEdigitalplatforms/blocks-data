namespace DataGateway.DomainService.Gateway;

/// <summary>
/// A failure the gateway reports to its caller, independent of the transport. The GraphQL layer
/// turns it into a GraphQL error carrying the same code and message; another transport (REST) can
/// map the same code to its own status.
/// </summary>
public sealed class GatewayException(
    string code,
    string message,
    IReadOnlyList<GatewayFieldError>? fieldErrors = null) : Exception(message)
{
    public string Code { get; } = code;

    /// <summary>Per-field validation failures, or null when the failure is not a validation failure.</summary>
    public IReadOnlyList<GatewayFieldError>? FieldErrors { get; } = fieldErrors;
}

public sealed record GatewayFieldError(string Field, string Message, string ValidationType);
