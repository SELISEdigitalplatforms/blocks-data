namespace DataGateway.DomainService.Services;

/// <summary>
/// Read-only view of the tenant's data-source root doc. The config API (get/save) lives in blocks-os.
/// </summary>
public interface IDataGatewayConfigurationService
{
    Task<bool> CanAccessAnalyticsAsync();
}
