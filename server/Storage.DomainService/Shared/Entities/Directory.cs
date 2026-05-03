using Blocks.Genesis;
using MongoDB.Bson.Serialization.Attributes;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Entities
{
    [BsonIgnoreExtraElements]
    public class Directory : Structure
    {
        public string TenantId { get; set; }

        public static Directory CreateNew(DirectoryOptions directoryOptions)
        {
            return new Directory
            {
                Name = directoryOptions.Name,
                ParentDirectoryID = string.IsNullOrEmpty(directoryOptions.ParentDirectoryId) ? null : directoryOptions.ParentDirectoryId,
                SystemName = directoryOptions.Name.ToLower(),
                Type = StructureType.Directory,
                TypeString = StructureType.Directory.ToString(),
                MetaData = directoryOptions.MetaData,
                ItemId = directoryOptions.ItemId,
                TenantId = directoryOptions.TenantId,
                CreatedDate = directoryOptions.CreateDate,
                CreatedBy = directoryOptions.CreatedBy,
                Tags = directoryOptions.Tags,
                Language = directoryOptions.Language,
                AllowedFileExtensions = directoryOptions.AllowedFileExtensions,
            };
        }

        public static Directory CreateNew(string itemId)
        {
            return new Directory { ItemId = itemId };
        }
    }

    public class DirectoryOptions
    {
        public string Name { get; set; }
        public string ParentDirectoryId { get; set; }
        public Dictionary<string, MetaValue> MetaData { get; set; }
        public string ItemId { get; set; }
        public string TenantId { get; set; }
        public DateTime CreateDate { get; set; }
        public string CreatedBy { get; set; }
        public List<string> Tags { get; set; }
        public string Language { get; set; }
        public string[] AllowedFileExtensions { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class Structure : BaseEntity
    {
        public Structure()
        {
            MetaData = new Dictionary<string, MetaValue>();
        }

        public Dictionary<string, MetaValue> MetaData { get; set; }
        public string Name { get; set; }
        public string? ParentDirectoryID { get; set; }
        public string SystemName { get; set; }
        public StructureType Type { get; set; }
        public string TypeString { get; set; }
        public string[] AllowedFileExtensions { get; set; }
    }
}
