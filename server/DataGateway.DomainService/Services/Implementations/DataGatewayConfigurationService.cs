using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Helpers;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Read-only access to the data-source root doc (<c>BlocksRootDb.DataServiceConfigurations</c>, <c>_id = TenantId</c>).
/// The config API (get/save/create) is owned by blocks-os; blocks-data never writes this doc.
/// </summary>
public class DataGatewayConfigurationService : IDataGatewayConfigurationService
{
    private readonly IDataSourceConfigStore _store;

    public DataGatewayConfigurationService(IDataSourceConfigStore store)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
    }

    public async Task<GatewayOptions?> GetOptionsAsync()
    {
        var root = await _store.GetRootAsync(TenantContext.GetTenantId());
        return root is null ? null : new GatewayOptions(
            root.IsCollectionNameEditable,
            root.CollectionNamePattern,
            root.AnalyticsConfiguration);
    }

    public async Task<bool> CanAccessAnalyticsAsync()
    {
        // The caller's own root doc (read only: analytics never creates a doc).
        var root = await _store.GetRootAsync(TenantContext.GetTenantId());
        return root?.AnalyticsConfiguration?.IsAccessibleAt(DateTime.UtcNow) == true;
    }
}
