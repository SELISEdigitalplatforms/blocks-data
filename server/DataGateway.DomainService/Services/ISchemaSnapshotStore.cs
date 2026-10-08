using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Stores and loads published schema snapshots (<see cref="PublishedSchemaSnapshot"/>). Every call
/// names the tenant explicitly.
/// </summary>
public interface ISchemaSnapshotStore
{
    /// <summary>
    /// Writes <paramref name="content"/> as version <paramref name="version"/>: the chunks first,
    /// then the manifest. Fails if that version already exists.
    /// </summary>
    Task<PublishedSchemaSnapshot> SaveAsync(
        string tenantId,
        long version,
        SchemaSnapshotContent content,
        SchemaSnapshotKind kind,
        IReadOnlyCollection<string> changeLogIds,
        CancellationToken cancellationToken = default);

    /// <summary>The content of a version; null when that version has no (complete) snapshot.</summary>
    Task<SchemaSource?> LoadAsync(string tenantId, long version, CancellationToken cancellationToken = default);

    /// <summary>Whether a complete snapshot exists for <paramref name="version"/>.</summary>
    Task<bool> ExistsAsync(string tenantId, long version, CancellationToken cancellationToken = default);

    /// <summary>The newest snapshots' manifests, newest first.</summary>
    Task<IReadOnlyList<PublishedSchemaSnapshot>> ListAsync(string tenantId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes all but the newest <paramref name="keep"/> snapshots, never deleting
    /// <paramref name="protectedVersion"/> (the live one). Returns how many were deleted.
    /// </summary>
    Task<int> PruneAsync(string tenantId, int keep, long protectedVersion, CancellationToken cancellationToken = default);
}

/// <summary>A <see cref="SchemaSource"/> serialized and compressed, ready to be stored.</summary>
public sealed record SchemaSnapshotContent(byte[] CompressedBytes, long RawSizeBytes, int SchemaCount);
