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
}

/// <summary>A <see cref="SchemaSource"/> serialized and compressed, ready to be stored.</summary>
public sealed record SchemaSnapshotContent(byte[] CompressedBytes, long RawSizeBytes, int SchemaCount);
