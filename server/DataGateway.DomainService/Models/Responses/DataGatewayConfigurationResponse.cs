using System;

namespace DataGateway.DomainService.Models;

public class DataGatewayConfigurationResponse
{
    public string DbConnectionString { get; set; } = string.Empty;
    public bool IsCollectionNameEditable { get; set; }
    public string CollectionNamePattern { get; set; } = "sb_{SchemaName}s";
    public string DatabaseName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public string? ItemId { get; set; } = default!;
    public AnalyticsConfigurationResponse AnalyticsConfiguration { get; set; } = new();

}

public class AnalyticsConfigurationResponse
{
    public bool EnableAnalytics { get; set; }
    public DateTime? EnableDate { get; set; }
    public DateTime? ValidTill { get; set; }
}

/// <summary>
/// Deprecated alias kept for backward compatibility.
/// </summary>
[Obsolete("Renamed to DataGatewayConfigurationResponse.")]
public class DataServiceConfigurationResponse : DataGatewayConfigurationResponse
{
}
