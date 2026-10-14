using Blocks.DataAccess.Models;
using MongoDB.Bson.Serialization.Attributes;

namespace Blocks.DataAccess.Entities;

[BsonIgnoreExtraElements]
public class SchemaExportRecord : GraphQlBaseEntity
{
    public string FileId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public SchemaExportOption ExportOption { get; set; }
    public DateTime ExportedAt { get; set; } = DateTime.UtcNow;
}
