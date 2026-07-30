using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

// Namespaced apart from the legacy storage DTOs: a CreateFolderRequest already
// exists there for the folder methods that SPEC B5 retires in the post-migration
// pass, and the two must coexist until that lands.
namespace DomainService.Storage.Dms
{
    // Response contracts for the DMS content endpoints.

    /// <summary>The six operations a caller may hold on one item.</summary>
    public class PermissionFlags
    {
        public bool CanView { get; set; }
        public bool CanDownload { get; set; }
        public bool CanEdit { get; set; }
        public bool CanDelete { get; set; }
        public bool CanManage { get; set; }
        public bool CanOwner { get; set; }
    }

    /// <summary>
    /// One entry in a children listing. Folders and files share this shape, discriminated
    /// by <see cref="Type"/>, so a client can render a mixed listing without inspecting
    /// two different payloads. Fields that only apply to files are null on a folder, and
    /// the reverse.
    /// </summary>
    public class DmsItem
    {
        public string ItemId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;

        /// <summary>Folder or File. The discriminator for the rest of this shape.</summary>
        public StructureType Type { get; set; }

        public string? ParentFolderId { get; set; }
        public long SizeInBytes { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime LastUpdatedDate { get; set; }
        public string? CreatedBy { get; set; }

        // File only.
        public string? Extension { get; set; }
        public string? ContentType { get; set; }
        public long? CurrentVersion { get; set; }

        // Folder only.
        public int? ChildFolderCount { get; set; }
        public int? ChildFileCount { get; set; }

        public PermissionFlags Permissions { get; set; } = new();
    }

    public class ChildrenResponse
    {
        public List<DmsItem> Items { get; set; } = new();

        /// <summary>Opaque token for the next page. Null when the listing is exhausted.</summary>
        public string? NextCursor { get; set; }

        /// <summary>
        /// Raw child count before access filtering. Informational: it deliberately does
        /// not agree with the number of items returned, because a filtered total would
        /// mean resolving every child on every page.
        /// </summary>
        public long TotalChildCount { get; set; }

        public bool HasMore { get; set; }
    }

    public class AccessPolicyDto
    {
        public string ItemId { get; set; } = string.Empty;
        public string ResourceId { get; set; } = string.Empty;
        public ContentResourceType ResourceType { get; set; }
        public ContentPrincipalType PrincipalType { get; set; }
        public string? PrincipalId { get; set; }
        public ContentPermission Permission { get; set; }
        public ContentEffect Effect { get; set; }
        public int Priority { get; set; }
        public DateTime? ExpiresAt { get; set; }
        public string? GrantedBy { get; set; }
        public DateTime CreatedDate { get; set; }

        public static AccessPolicyDto From(ContentAccessPolicy policy) => new()
        {
            ItemId = policy.ItemId,
            ResourceId = policy.ResourceId,
            ResourceType = policy.ResourceType,
            PrincipalType = policy.PrincipalType,
            PrincipalId = policy.PrincipalId,
            Permission = policy.Permission,
            Effect = policy.Effect,
            Priority = policy.Priority,
            ExpiresAt = policy.ExpiresAt,
            GrantedBy = policy.GrantedBy,
            CreatedDate = policy.CreatedDate,
        };
    }

    public class FileVersionDto
    {
        public string ItemId { get; set; } = string.Empty;
        public long No { get; set; }
        public long SizeInBytes { get; set; }
        public string? UploadedBy { get; set; }
        public DateTime CreatedDate { get; set; }

        public static FileVersionDto From(FileVersion version) => new()
        {
            ItemId = version.ItemId,
            No = version.No,
            SizeInBytes = version.SizeInBytes,
            UploadedBy = version.UploadedBy,
            CreatedDate = version.CreatedDate,
        };
    }

    public class FileVersionsResponse
    {
        public List<FileVersionDto> Items { get; set; } = new();
        public string? NextCursor { get; set; }
        public bool HasMore { get; set; }
    }
}
