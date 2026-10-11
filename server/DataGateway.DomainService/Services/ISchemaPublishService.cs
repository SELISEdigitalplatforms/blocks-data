using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Publishes a tenant's schema drafts as an immutable, versioned snapshot that every pod serves.
/// </summary>
public interface ISchemaPublishService
{
    /// <summary>
    /// Validates the tenant's current drafts, stores them as the next version, makes that version
    /// live, marks the pending changes it contains as published, and tells every pod. Throws
    /// <see cref="SchemaPublishException"/>, and changes nothing, when the drafts do not build.
    /// </summary>
    Task<SchemaPublishResult> PublishAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates the first snapshot for a tenant that has none (tenants from before snapshots), from
    /// its current drafts and without validation, so the tenant keeps serving what it served
    /// before. Pending changes stay pending. Returns the version and its content.
    /// </summary>
    Task<(long Version, SchemaSource Source)> BootstrapAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Makes an earlier published version live again and tells every pod. The drafts and the
    /// pending changes are not touched, and the next publish still gets a new version number.
    /// Throws <see cref="SchemaVersionNotFoundException"/> when that version is not kept.
    /// </summary>
    Task<SchemaRollbackResult> RollbackAsync(string tenantId, long version, CancellationToken cancellationToken = default);

    /// <summary>The live version and the kept versions, newest first.</summary>
    Task<SchemaVersionHistory> GetHistoryAsync(string tenantId, CancellationToken cancellationToken = default);
}

/// <summary>The outcome of a publish.</summary>
public sealed record SchemaPublishResult(long Version, int PublishedChangeCount);

/// <summary>The outcome of a rollback: the version now live, and the one it replaced.</summary>
public sealed record SchemaRollbackResult(long Version, long PreviousVersion);

/// <summary>The live version and the kept published versions, newest first.</summary>
public sealed record SchemaVersionHistory(long CurrentVersion, IReadOnlyList<SchemaVersionSummary> Versions);

/// <summary>One kept published version, as listed in the version history.</summary>
public sealed record SchemaVersionSummary(
    long Version,
    string Kind,
    DateTime PublishedDate,
    string? PublishedBy,
    int ChangeCount,
    int SchemaCount,
    bool IsCurrent);

/// <summary>The requested version is not one of the kept published versions.</summary>
public sealed class SchemaVersionNotFoundException(long version)
    : Exception($"Schema version {version} does not exist or is no longer kept.");
