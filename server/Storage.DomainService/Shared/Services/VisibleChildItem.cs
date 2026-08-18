using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    /// <summary>One child of a directory, with the operations the caller holds on it.</summary>
    public sealed class VisibleChildItem
    {
        public string ItemId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public StructureType Type { get; set; }
        public string? ParentDirectoryId { get; set; }
        public long SizeInBytes { get; set; }
        public string? Extension { get; set; }
        public string? ContentType { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime LastUpdatedDate { get; set; }
        public string? CreatedBy { get; set; }
        public bool IsDefault { get; set; }
        public ObjectPermissionFlags Permissions { get; set; } = new();
    }
}
