using Blocks.Genesis;
using MongoDB.Bson.Serialization.Attributes;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Entities
{
    [BsonIgnoreExtraElements]
    public class Structure : BaseEntity
    {
        public Structure() => MetaData = new Dictionary<string, MetaValue>();
        public Dictionary<string, MetaValue> MetaData { get; set; }
        public string Name { get; set; }
        public string? ParentId { get; set; }
        public string SystemName { get; set; }
        public StructureType Type { get; set; }
        public string TypeString { get; set; }
        public string[] AllowedFileExtensions { get; set; }
    }
}
