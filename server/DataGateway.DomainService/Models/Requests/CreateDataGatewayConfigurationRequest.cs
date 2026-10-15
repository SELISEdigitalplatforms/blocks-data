namespace DataGateway.DomainService.Models;

public class CreateDataGatewayConfigurationRequest
{
    /// <summary>Ignored on create; on update it must be the tenant's root doc id (the TenantId, as GET returns it).</summary>
    public string ItemId { get; set; } = string.Empty;

    /// <summary>
    /// <c>"default"</c> or empty = the tenant's Blocks DB; otherwise the real connection string (plain text).
    /// Omitted (null) on update = keep the current data source.
    /// </summary>
    public string? ConnectionString { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
}
