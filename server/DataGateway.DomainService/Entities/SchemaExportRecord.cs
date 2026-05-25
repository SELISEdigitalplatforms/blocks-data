using DataGateway.DomainService.Models;
using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Entities;

[BsonIgnoreExtraElements]
public class SchemaExportRecord : GraphQlBaseEntity
{
    public string FileId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public SchemaExportOption ExportOption { get; set; }
    public DateTime ExportedAt { get; set; } = DateTime.UtcNow;
}
