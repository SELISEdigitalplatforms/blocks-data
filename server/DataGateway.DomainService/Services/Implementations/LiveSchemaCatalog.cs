using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Reads the live version's schema IDs from its snapshot. A published version never changes, so
/// the IDs are kept per tenant until its live version does; only the version number is read per call.
/// </summary>
public sealed class LiveSchemaCatalog : ILiveSchemaCatalog
{
    private readonly ConcurrentDictionary<string, (long Version, IReadOnlySet<string> Ids)> _byTenant = new(StringComparer.Ordinal);
    private readonly ISchemaVersionStore _versionStore;
    private readonly ISchemaSnapshotStore _snapshotStore;
    private readonly ILogger<LiveSchemaCatalog> _logger;

    public LiveSchemaCatalog(ISchemaVersionStore versionStore, ISchemaSnapshotStore snapshotStore, ILogger<LiveSchemaCatalog> logger)
    {
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
        _snapshotStore = snapshotStore ?? throw new ArgumentNullException(nameof(snapshotStore));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<IReadOnlySet<string>?> GetLiveSchemaIdsAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return null;
        }

        try
        {
            var version = await _versionStore.GetCachedAsync(tenantId, cancellationToken);
            if (version <= 0)
            {
                return null;
            }

            if (_byTenant.TryGetValue(tenantId, out var cached) && cached.Version == version)
            {
                return cached.Ids;
            }

            var source = await _snapshotStore.LoadAsync(tenantId, version, cancellationToken);
            if (source is null)
            {
                return null;
            }

            var ids = source.SchemaDefinitions.Select(s => s.ItemId).ToHashSet(StringComparer.Ordinal);
            _byTenant[tenantId] = (version, ids);
            return ids;
        }
        catch (Exception ex)
        {
            // Only decorates the schema list; never fail the list over it.
            _logger.LogWarning(ex, "Could not read the live schema version of tenant {TenantId}; schemas are listed without their live state", tenantId);
            return null;
        }
    }
}
