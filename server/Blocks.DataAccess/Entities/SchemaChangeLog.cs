using Blocks.DataAccess.Models;
using MongoDB.Bson.Serialization.Attributes;

namespace Blocks.DataAccess.Entities;

/// <summary>
/// Represents a schema change log.
/// </summary>
[BsonIgnoreExtraElements]
public class SchemaChangeLog : GraphQlBaseEntity
{
    public string SchemaId { get; set; } = string.Empty;
    public SchemaChangeType ChangeType { get; set; }
    public bool DoesServerAdaptChanges { get; set; } = false;
}


