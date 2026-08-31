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
    public int Failed { get; set; }

    /// <summary>Percentage of <see cref="Calls"/> that failed, rounded to 2 decimal places.</summary>
    public double ErrorRate { get; set; }
}
