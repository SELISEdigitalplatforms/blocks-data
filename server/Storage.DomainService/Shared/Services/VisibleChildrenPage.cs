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
        public ContentPermissionFlags Permissions { get; set; } = new();
    }

    public sealed class VisibleChildrenPage
    {
        public List<VisibleChildItem> Items { get; set; } = new();

        /// <summary>Null when the stream is exhausted.</summary>
        public string? NextCursor { get; set; }

        /// <summary>
        /// Raw child count for the directory, before access filtering. Informational only:
        /// it deliberately does not agree with the number of visible items, because
        /// computing a filtered total would mean resolving every child on every page.
        /// </summary>
        public long TotalChildCount { get; set; }

        public bool HasMore { get; set; }
    }
}
