using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Entities;

/// <summary>How a published schema snapshot came to exist.</summary>
public enum SchemaSnapshotKind
{
    /// <summary>An admin published the drafts.</summary>
    Publish,

    /// <summary>
    /// Created automatically from the drafts the first time a pod builds a tenant that has no
    /// snapshot yet (every tenant that existed before snapshots), so it serves what it served before.
    /// </summary>
    Bootstrap
}

/// <summary>
/// One published version of a tenant's schemas: the manifest. The content (schema definitions,
/// validations and access policies as they were at publish time) is stored compressed in
/// <see cref="PublishedSchemaSnapshotChunk"/> documents, written before this manifest, so a
/// manifest always means the snapshot is complete. Pods build only from snapshots, never from the
/// drafts being edited. The document id is the version, so a version can only be written once.
/// </summary>
[BsonIgnoreExtraElements]
public class PublishedSchemaSnapshot : GraphQlBaseEntity
{
    public long Version { get; set; }
    public SchemaSnapshotKind Kind { get; set; }
    public int ChunkCount { get; set; }
    public long RawSizeBytes { get; set; }
    public long CompressedSizeBytes { get; set; }
    public int SchemaCount { get; set; }

    /// <summary>The change logs this publish made live.</summary>
    public List<string> ChangeLogIds { get; set; } = [];

    public string? PublishedBy { get; set; }
    public DateTime PublishedDate { get; set; }

    public static string IdFor(long version) => version.ToString(System.Globalization.CultureInfo.InvariantCulture);
}

/// <summary>One piece of a snapshot's compressed content (see <see cref="PublishedSchemaSnapshot"/>).</summary>
[BsonIgnoreExtraElements]
public class PublishedSchemaSnapshotChunk : GraphQlBaseEntity
{
    public long Version { get; set; }
    public int Index { get; set; }
    public byte[] Data { get; set; } = [];

    public static string IdFor(long version, int index) =>
        string.Create(System.Globalization.CultureInfo.InvariantCulture, $"{version}:{index}");
}
