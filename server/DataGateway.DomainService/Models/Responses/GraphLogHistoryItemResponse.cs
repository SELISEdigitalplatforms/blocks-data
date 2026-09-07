namespace DataGateway.DomainService.Models.Responses;

/// <summary>
/// One entry from the "Traces" trace-store database, for a request that carried a
/// "GatewayOperation" activity tag (<see cref="Helpers.GatewayOperationActivity"/>). Combines the
/// span-level fields written by <c>Blocks.Genesis.MongoDBTraceExporter</c> with the
/// GraphQL-specific fields nested under its <c>Attributes.GatewayOperation</c> document.
/// </summary>
public class GraphLogHistoryItemResponse
{
    public string TraceId { get; set; } = string.Empty;
    public string SpanId { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public double Duration { get; set; }
    public string OperationName { get; set; } = string.Empty;
    public string StatusDescription { get; set; } = string.Empty;

    public string SchemaName { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string CollectionName { get; set; } = string.Empty;
    public string OperationType { get; set; } = string.Empty;
    public string OperationQuery { get; set; } = string.Empty;
    public string MongoQuery { get; set; } = string.Empty;
    public string ResponseStatus { get; set; } = string.Empty;

    /// <summary>
    /// Why the request failed — one of the <see cref="Helpers.GatewayFailureKind"/> values
    /// ("authentication", "authorization", "validation", "bad_request", "unhandled", "unknown").
    /// Empty when the request succeeded.
    /// </summary>
    public string FailureKind { get; set; } = string.Empty;

    /// <summary>The GraphQL error code behind <see cref="FailureKind"/>.</summary>
    public string FailureCode { get; set; } = string.Empty;

    /// <summary>Human-readable failure reason.</summary>
    public string FailureMessage { get; set; } = string.Empty;

    /// <summary>
    /// HTTP status code the gateway replied with, from the span's "http.response.status_code"
    /// attribute (0 when the span carries no status code).
    /// </summary>
    public int StatusCode { get; set; }

    /// <summary>Request body size in bytes, from the span's "request.size.bytes" attribute.</summary>
    public long RequestSize { get; set; }

    /// <summary>Response body size in bytes, from the span's "response.size.bytes" attribute.</summary>
    public long ResponseSize { get; set; }

    /// <summary>
    /// Size in bytes of the data the gateway read back from the database, from the
    /// GatewayOperation tag's own ResponseSize — the payload before it was shaped into an HTTP
    /// response, so it differs from <see cref="ResponseSize"/>.
    /// </summary>
    public long DatabaseResponseSize { get; set; }

    /// <summary>Documents returned (query) or affected (mutation). 0 on traces recorded before this was captured.</summary>
    public int DocumentCount { get; set; }

    public bool InAppRequest { get; set; }

    /// <summary>
    /// Whether this was a schema introspection query rather than data access. Kept in the history
    /// but excluded from analytics.
    /// </summary>
    public bool IsIntrospection { get; set; }

    /// <summary>Raw User-Agent of the client that made the request.</summary>
    public string UserAgent { get; set; } = string.Empty;

    /// <summary>Milliseconds spent evaluating access policies.</summary>
    public double PolicyMs { get; set; }

    /// <summary>Milliseconds spent validating input.</summary>
    public double ValidationMs { get; set; }

    /// <summary>Milliseconds spent in MongoDB.</summary>
    public double DatabaseMs { get; set; }

    /// <summary>Milliseconds spent publishing data-change events.</summary>
    public double PublishMs { get; set; }
}
