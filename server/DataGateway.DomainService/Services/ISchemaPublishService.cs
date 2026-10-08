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
}

/// <summary>The outcome of a publish.</summary>
public sealed record SchemaPublishResult(long Version, int PublishedChangeCount);
