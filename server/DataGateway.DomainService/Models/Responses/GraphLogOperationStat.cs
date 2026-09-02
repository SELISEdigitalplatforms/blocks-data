namespace DataGateway.DomainService.Models.Responses;

/// <summary>
/// Aggregated call counts for one GraphQL field (<c>GatewayOperation.SchemaName</c>) over a date
/// range. <see cref="SchemaName"/> is <c>"(unknown)"</c> for requests where it was never
/// captured (introspection queries, or failures before the field name was resolved).
/// </summary>
public class GraphLogOperationStat
{
    public string SchemaName { get; set; } = string.Empty;
    public int Calls { get; set; }
    public int Success { get; set; }

    /// <summary>Everything that did not succeed: <see cref="Denied"/> plus <see cref="Errored"/>.</summary>
    public int Failed { get; set; }

    /// <summary>Refused on purpose — authentication, authorization or validation.</summary>
    public int Denied { get; set; }

    /// <summary>Failed because something broke.</summary>
    public int Errored { get; set; }

    /// <summary>Percentage of <see cref="Calls"/> that failed, rounded to 2 decimal places.</summary>
    public double ErrorRate { get; set; }

    /// <summary>Mean response time in milliseconds.</summary>
    public double AverageDuration { get; set; }

    /// <summary>95th-percentile response time in milliseconds — what the slowest 1-in-20 caller sees.</summary>
    public double P95Duration { get; set; }

    /// <summary>
    /// Mean response body size in bytes. A large average is the signature of a caller reading a
    /// collection without paging, which is cheap to fix and expensive to leave alone.
    /// </summary>
    public double AverageResponseSize { get; set; }

    /// <summary>Largest single response body in bytes.</summary>
    public long MaxResponseSize { get; set; }

    /// <summary>Total bytes moved in and out for this field across the range.</summary>
    public long TotalBytes { get; set; }

    /// <summary>
    /// Mean documents returned or affected per call. Read next to
    /// <see cref="AverageResponseSize"/>: many small documents means paging is missing, while one
    /// large document means the shape itself is heavy.
    /// </summary>
    public double AverageDocumentCount { get; set; }

    /// <summary>Most documents any single call returned or affected.</summary>
    public int MaxDocumentCount { get; set; }
}
