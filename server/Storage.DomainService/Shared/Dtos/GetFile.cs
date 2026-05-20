using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Dtos
{
    [BsonIgnoreExtraElements]
    public class GetFile
    {
        [BsonId]
        public string ItemId { get; set; }
        public string Url { get; set; }
        public string TenantId { get; set; }

        [BsonRepresentation(BsonType.String)]
        public AccessModifier AccessModifier { get; set; }
        public Dictionary<string, MetaValue>? MetaData { get; set; }
        public string Name { get; set; }
        public string? ParentDirectoryID { get; set; }
        public string SystemName { get; set; }
        public StructureType Type { get; set; }
        public string TypeString { get; set; }
        public long CurrentVersion { get; set; }
        public Dictionary<string, string> AdditionalProperties { get; set; } = new Dictionary<string, string>();
    }
}
