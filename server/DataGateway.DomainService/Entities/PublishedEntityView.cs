using MongoDB.Bson.Serialization.Attributes;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Entities;

/// <summary>
/// One entity's slice of a published schema version: the entity, the DTOs it nests, the entities its
/// rules look up, and their rules and policies, packed like a snapshot. One doc per entity and version
/// in the tenant's <c>PublishedEntityViews</c> (the repository names a collection after the type), so
/// a request loads one small view instead of the tenant's whole schema.
/// <c>_id</c> is <c>{Version}:{SchemaName}</c>.
/// </summary>
[BsonIgnoreExtraElements]
public class PublishedEntityView : GraphQlBaseEntity
{
    public long Version { get; set; }

    public string SchemaName { get; set; } = string.Empty;

    /// <summary>The gzip-packed mini <c>SchemaSource</c> (<c>SchemaSnapshotStore.Pack</c>).</summary>
    public byte[] Content { get; set; } = [];

    public static string IdFor(long version, string schemaName) => $"{version}:{schemaName}";
}
