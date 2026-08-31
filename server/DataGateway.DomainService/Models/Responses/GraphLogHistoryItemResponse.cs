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
    public string Status { get; set; } = string.Empty;
    public string StatusDescription { get; set; } = string.Empty;

    public string SchemaName { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string CollectionName { get; set; } = string.Empty;
    public string OperationType { get; set; } = string.Empty;
    public string OperationQuery { get; set; } = string.Empty;
    public string MongoQuery { get; set; } = string.Empty;
    public string ResponseStatus { get; set; } = string.Empty;

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

    public bool InAppRequest { get; set; }
}
