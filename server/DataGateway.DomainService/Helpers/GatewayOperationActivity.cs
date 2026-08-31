using System.Diagnostics;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Why a gateway request failed. A request is logged as "failed" whenever it did not return data,
/// which covers several very different situations — these are the names that tell them apart, and
/// they are what the analytics UI groups and filters on.
/// </summary>
public static class GatewayFailureKind
{
    /// <summary>The caller could not be identified: missing/invalid token, or an x-blocks-key that
    /// does not match the tenant being addressed.</summary>
    public const string Authentication = "authentication";

    /// <summary>The caller is known but not allowed to perform the operation: schema access level
    /// or a row/field-level access policy denied it.</summary>
    public const string Authorization = "authorization";

    /// <summary>The input was rejected by field validation, including uniqueness checks.</summary>
    public const string Validation = "validation";

    /// <summary>The GraphQL document itself was unusable: syntax error, unknown field, bad
    /// variables. The request never reached a resolver.</summary>
    public const string BadRequest = "bad_request";

    /// <summary>An unexpected, unhandled server-side error.</summary>
    public const string Unhandled = "unhandled";

    /// <summary>Failed, but with no signal that maps onto any of the above.</summary>
    public const string Unknown = "unknown";
}

/// <summary>
/// Diagnostic snapshot of a single GraphQL operation (query or mutation), attached to the
/// current <see cref="Activity"/> as a single "GatewayOperation" tag. Populated partly by
/// <see cref="DataGateway.DomainService.GraphQL.GatewayActivityDiagnosticEventListener"/>
/// (transport-level fields, set for every request regardless of which resolver runs) and partly
/// by the field middleware / resolver (<c>SchemaAccessMiddlewareHelper</c>,
/// <c>QueryService</c>/<c>MutationService</c>) that services the request (schema/Mongo-specific
/// fields, which the listener cannot see).
/// </summary>
public sealed class GatewayOperation
{
    /// <summary>The GraphQL field name that was invoked, e.g. "getStudents".</summary>
    public string? SchemaName { get; set; }

    /// <summary>The logical schema/entity name, e.g. "Student".</summary>
    public string? EntityName { get; set; }

    /// <summary>
    /// The backing Mongo collection name, e.g. "Students". Set only once execution actually
    /// reaches the point of building a Mongo query (alongside <see cref="MongoQuery"/>) — stays
    /// empty when a request fails before that (access denied, validation error, etc.).
    /// </summary>
    public string CollectionName { get; set; } = string.Empty;

    public string? OperationType { get; set; }
    public string? OperationQuery { get; set; }

    /// <summary>
    /// The raw Mongo filter/update/insert document. Stays empty when a request fails before
    /// execution reaches the point of building a Mongo query.
    /// </summary>
    public string MongoQuery { get; set; } = string.Empty;
    /// <summary>"success" or "failed" — see <see cref="GatewayFailureKind"/> for what "failed" covers.</summary>
    public string ResponseStatus { get; set; } = "success";

    /// <summary>
    /// One of the <see cref="GatewayFailureKind"/> values; empty on success. Set by whichever check
    /// rejected the request (it knows exactly why), and otherwise inferred from the resulting
    /// GraphQL errors by <see cref="GraphQL.GatewayActivityDiagnosticEventListener"/>.
    /// </summary>
    public string FailureKind { get; set; } = string.Empty;

    /// <summary>The GraphQL error code behind <see cref="FailureKind"/>, kept as the raw signal.</summary>
    public string FailureCode { get; set; } = string.Empty;

    /// <summary>Human-readable reason, shown in the log details panel. Empty on success.</summary>
    public string FailureMessage { get; set; } = string.Empty;

    public int ResponseSize { get; set; }
    public bool InAppRequest { get; set; }

    /// <summary>
    /// Converts to a plain <see cref="Dictionary{TKey,TValue}"/> so the activity tag carries a
    /// real (nested) object rather than this class instance directly — trace exporters that map
    /// tag values onto another format (e.g. this project's Mongo trace exporter, which maps every
    /// tag value through <c>BsonValue.Create</c>) know how to convert a dictionary but not an
    /// arbitrary POCO.
    /// </summary>
    internal Dictionary<string, object?> ToDictionary() => new()
    {
        [nameof(SchemaName)] = SchemaName,
        [nameof(EntityName)] = EntityName,
        [nameof(CollectionName)] = CollectionName,
        [nameof(OperationType)] = OperationType,
        [nameof(OperationQuery)] = OperationQuery,
        [nameof(MongoQuery)] = MongoQuery,
        [nameof(ResponseStatus)] = ResponseStatus,
        [nameof(FailureKind)] = FailureKind,
        [nameof(FailureCode)] = FailureCode,
        [nameof(FailureMessage)] = FailureMessage,
        [nameof(ResponseSize)] = ResponseSize,
        [nameof(InAppRequest)] = InAppRequest,
    };
}

/// <summary>
/// Reads/writes the <see cref="GatewayOperation"/> associated with an <see cref="Activity"/>. Uses
/// <see cref="Activity.SetCustomProperty"/> rather than context-data plumbing so the same instance
/// is reachable from both the GraphQL request pipeline and the field middleware/resolver it wraps,
/// without requiring either side to know about the other.
/// </summary>
public static class GatewayOperationActivity
{
    private const string PropertyName = "GatewayOperation";

    public static GatewayOperation GetOrCreate(Activity? activity)
    {
        if (activity is null)
            return new GatewayOperation();

        if (activity.GetCustomProperty(PropertyName) is GatewayOperation existing)
            return existing;

        var gatewayOperation = new GatewayOperation();
        activity.SetCustomProperty(PropertyName, gatewayOperation);
        return gatewayOperation;
    }

    /// <summary>
    /// Writes the operation onto the activity. Uses SetTag rather than AddTag so calling it more
    /// than once for the same request (e.g. an early rejection in the endpoint plus the GraphQL
    /// pipeline listener) replaces the tag instead of writing a duplicate key.
    /// </summary>
    public static void Tag(Activity? activity, GatewayOperation gatewayOperation) =>
        activity?.SetTag(PropertyName, gatewayOperation.ToDictionary());

    /// <summary>
    /// Records why a request failed. The first caller wins: the check that rejected the request is
    /// more specific than anything that can be inferred from the error it produces further out.
    /// </summary>
    public static GatewayOperation MarkFailed(
        Activity? activity,
        string failureKind,
        string? failureMessage = null,
        string? failureCode = null)
    {
        var gatewayOperation = GetOrCreate(activity);
        gatewayOperation.ResponseStatus = "failed";

        if (string.IsNullOrEmpty(gatewayOperation.FailureKind))
        {
            gatewayOperation.FailureKind = failureKind;
            gatewayOperation.FailureCode = failureCode ?? string.Empty;
            gatewayOperation.FailureMessage = failureMessage ?? string.Empty;
        }

        return gatewayOperation;
    }
}
