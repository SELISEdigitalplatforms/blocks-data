using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;
using Blocks.Genesis;
using Storage.DomainService.Enums;

namespace DomainService.Storage
{
    public class FileResponse : BaseResponse
    {
        public string Url { get; set; }

        [BsonRepresentation(BsonType.Int32)]
        public AccessModifier AccessModifier { get; set; }

        [BsonId]
        public string ItemId { get; set; }
        public string[] Tags { get; set; }
        public Dictionary<string, FileMetaDataResponse> MetaData { get; set; }
        public string Name { get; set; }
        public string ParentDirectoryID { get; set; }
        public string SystemName { get; set; }
        public int Type { get; set; }
        public string TypeString { get; set; }
        public DateTime CreateDate { get; set; }
        public string CreatedBy { get; set; }
        public string Language { get; set; }
        public string TenantId { get; set; }
        public long SizeInBytes { get; set; }
        public static bool Exists { get { return true; } }
    }

    public class FileMetaDataResponse
    {
        public string Type { get; set; }
        public string Value { get; set; }
    }
}
