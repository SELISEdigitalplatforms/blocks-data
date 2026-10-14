using Blocks.Genesis;
using Blocks.DataAccess.Policies;
using Blocks.DataAccess.Models;
using MongoDB.Bson.Serialization.Attributes;

namespace Blocks.DataAccess.Entities;

[BsonIgnoreExtraElements]
public class DataMutationRecord : BaseEntity
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public string SchemaId { get; set; } = string.Empty;
    public string RecordItemId { get; set; } = string.Empty;
    public string Operation { get; set; } = string.Empty;
    public bool IsLatest { get; set; } = true;
    public required dynamic Record { get; set; }
}
