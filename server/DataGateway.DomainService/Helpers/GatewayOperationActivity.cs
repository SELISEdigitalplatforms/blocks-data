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

    /// <summary>The GraphQL document could not be parsed or validated by Hot Chocolate. The
    /// request never reached a resolver.</summary>
    public const string SyntaxError = "syntax_error";

    /// <summary>A non-GraphQL client request was malformed.</summary>
    public const string BadRequest = "bad_request";

    /// <summary>An unexpected, unhandled server-side error.</summary>
    public const string Unhandled = "unhandled";

    /// <summary>Failed, but with no signal that maps onto any of the above.</summary>
    public const string Unknown = "unknown";

    /// <summary>
    /// Whether a failure was the gateway refusing on purpose rather than something breaking.
    /// Authentication, authorization, validation and generic bad requests are denials; GraphQL
    /// document syntax failures are reported as errors.
    /// </summary>
    public static bool IsDenial(string? failureKind) =>
        failureKind is Authentication or Authorization or Validation or BadRequest;

    /// <summary>
    /// Server errors are defined by the HTTP response, not merely by a GraphQL error carrying an
    /// exception. Hot Chocolate uses exceptions internally for some invalid documents while still
    /// returning a 2xx response, so treating every such error as a server fault mislabels caller
    /// mistakes such as HC0017.
    /// </summary>
    public static bool IsServerErrorStatus(int statusCode) => statusCode is >= 500 and <= 599;
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

    /// <summary>
    /// How many documents the request returned (query) or affected (mutation). Paired with
    /// <see cref="ResponseSize"/> it separates "one huge document" from "ten thousand small ones",
    /// which are different problems with different fixes.
    /// </summary>
    public int DocumentCount { get; set; }

    public bool InAppRequest { get; set; }

    /// <summary>
    /// Whether the request was a schema introspection query (a GraphQL IDE or codegen tool fetching
    /// the schema) rather than data access. Analytics leaves these out: one introspection response
    /// can outweigh a day of real traffic.
    /// </summary>
    public bool IsIntrospection { get; set; }

    /// <summary>
    /// Milliseconds spent evaluating access policies (schema access level, row/field-level rules).
    /// Excludes any database time those checks themselves spent — see <see cref="PhaseScope"/>.
    /// </summary>
    public double PolicyMs { get; set; }

    /// <summary>Milliseconds spent validating mutation input, excluding its database time.</summary>
    public double ValidationMs { get; set; }

    /// <summary>Milliseconds spent in MongoDB.</summary>
    public double DatabaseMs { get; set; }

    /// <summary>Milliseconds spent publishing data-change events, excluding its database time.</summary>
    public double PublishMs { get; set; }

    /// <summary>
    /// How many database scopes are currently open. Some repository methods delegate to others, so
    /// the time has to be attributed once, by the outermost scope.
    /// </summary>
    internal int DatabaseDepth { get; set; }

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
        [nameof(DocumentCount)] = DocumentCount,
        [nameof(InAppRequest)] = InAppRequest,
        [nameof(IsIntrospection)] = IsIntrospection,
        [nameof(PolicyMs)] = PolicyMs,
        [nameof(ValidationMs)] = ValidationMs,
        [nameof(DatabaseMs)] = DatabaseMs,
        [nameof(PublishMs)] = PublishMs,
    };
}

/// <summary>The parts of a request's duration that are measured separately.</summary>
public enum GatewayPhase
{
    Policy,
    Validation,
    Database,
    Publish,
}

/// <summary>
/// Times one phase of a request and adds it to the request log on dispose. Phases are recorded so
/// they do not overlap: database time is measured at the leaf, any outer phase subtracts the
/// database time that accumulated inside it, and nested database scopes are attributed once — so
/// the phases plus a remainder add up to the request's duration instead of double-counting.
/// </summary>
public readonly struct PhaseScope : IDisposable
{
    private readonly GatewayOperation _gatewayOperation;
    private readonly GatewayPhase _phase;
    private readonly long _startedAt;
    private readonly double _databaseMsAtStart;
    private readonly bool _isNestedDatabaseScope;

    internal PhaseScope(GatewayOperation gatewayOperation, GatewayPhase phase)
    {
        _gatewayOperation = gatewayOperation;
        _phase = phase;
        _startedAt = Stopwatch.GetTimestamp();
        _databaseMsAtStart = gatewayOperation.DatabaseMs;

        _isNestedDatabaseScope = phase == GatewayPhase.Database && gatewayOperation.DatabaseDepth > 0;
        if (phase == GatewayPhase.Database)
            gatewayOperation.DatabaseDepth++;
    }

    public void Dispose()
    {
        var elapsedMs = Stopwatch.GetElapsedTime(_startedAt).TotalMilliseconds;

        if (_phase == GatewayPhase.Database)
        {
            _gatewayOperation.DatabaseDepth--;

            // The enclosing database scope already covers this time.
            if (_isNestedDatabaseScope)
                return;
        }
        else
        {
            elapsedMs -= _gatewayOperation.DatabaseMs - _databaseMsAtStart;
        }

        if (elapsedMs <= 0)
            return;

        switch (_phase)
        {
            case GatewayPhase.Policy:
                _gatewayOperation.PolicyMs += elapsedMs;
                break;
            case GatewayPhase.Validation:
                _gatewayOperation.ValidationMs += elapsedMs;
                break;
            case GatewayPhase.Database:
                _gatewayOperation.DatabaseMs += elapsedMs;
                break;
            case GatewayPhase.Publish:
                _gatewayOperation.PublishMs += elapsedMs;
                break;
        }
    }
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
    /// Times a phase of the current request: <c>using var _ = GatewayOperationActivity.Measure(...)</c>.
    /// A no-op (recorded onto a throwaway operation) when there is no ambient activity.
    /// </summary>
    public static PhaseScope Measure(GatewayPhase phase) =>
        new(GetOrCreate(Activity.Current), phase);

    /// <summary>
    /// Records why a request failed. The first specific caller wins: the check that rejected the
    /// request is more specific than anything inferred further out. "Unknown" is only a placeholder
    /// and may be replaced when the outer HTTP pipeline later observes the definitive reason.
    /// </summary>
    public static GatewayOperation MarkFailed(
        Activity? activity,
        string failureKind,
        string? failureMessage = null,
        string? failureCode = null)
    {
        var gatewayOperation = GetOrCreate(activity);
        gatewayOperation.ResponseStatus = "failed";

        if (string.IsNullOrEmpty(gatewayOperation.FailureKind)
            || gatewayOperation.FailureKind == GatewayFailureKind.Unknown)
        {
            gatewayOperation.FailureKind = failureKind;
            gatewayOperation.FailureCode = failureCode ?? string.Empty;
            gatewayOperation.FailureMessage = failureMessage ?? string.Empty;
        }

        return gatewayOperation;
    }
}
