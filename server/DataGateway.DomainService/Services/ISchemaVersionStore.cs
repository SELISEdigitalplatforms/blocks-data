namespace DataGateway.DomainService.Services;

/// <summary>
/// Reads and raises a tenant's published schema version (<see cref="Entities.SchemaPublishState"/>).
/// Every call names the tenant explicitly, so it works outside an HTTP request (for example while
/// HotChocolate rebuilds an executor in the background).
///
/// MongoDB holds the version. Redis keeps a short-lived copy that pods can poll cheaply, and a
/// channel that tells pods a new version was published; both only speed things up, so a lost
/// message or a wrong copy delays a pod but never leaves it on an old schema for long.
/// </summary>
public interface ISchemaVersionStore
{
    /// <summary>
    /// The tenant's current version from MongoDB; 0 when it has never published. Also refreshes
    /// the Redis copy.
    /// </summary>
    Task<long> GetAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The tenant's version from the Redis copy, falling back to <see cref="GetAsync"/> when the
    /// copy is missing or Redis is unavailable. Cheap enough to call on every check, but it may
    /// lag behind MongoDB; confirm with <see cref="GetAsync"/> before acting on a difference.
    /// </summary>
    Task<long> GetCachedAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically hands out the next version number for a new snapshot: one above the highest
    /// number ever handed out (or the current version, for tenants from before snapshots). Never
    /// returns the same number twice, also after a rollback.
    /// </summary>
    Task<long> AllocateAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Makes <paramref name="version"/> the live version unless a newer one already is, and
    /// returns the live version.
    /// </summary>
    Task<long> MakeCurrentAsync(string tenantId, long version, CancellationToken cancellationToken = default);

    /// <summary>Tells every pod that <paramref name="version"/> was published. Best effort.</summary>
    Task AnnounceAsync(string tenantId, long version);
}

/// <summary>The message sent on <see cref="SchemaVersionStore.ChannelName"/> when a tenant publishes.</summary>
public sealed record SchemaVersionPublished(string TenantId, long Version);
