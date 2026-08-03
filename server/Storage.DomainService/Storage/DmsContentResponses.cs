using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;

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

        public static PermissionFlags From(ContentPermissionFlags? flags) => flags is null
            ? new PermissionFlags()
            : new PermissionFlags
            {
                CanView = flags.CanView,
                CanDownload = flags.CanDownload,
                CanEdit = flags.CanEdit,
                CanDelete = flags.CanDelete,
                CanManage = flags.CanManage,
                CanOwner = flags.CanOwner,
            };
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

        /// <summary>
        /// Folder or File, as the contract the client reads. Serialized as the lowercased
        /// kind ("folder" / "file") rather than the numeric <see cref="StructureType"/>
        /// enum, because the frontend discriminates on this string and treats any value it
        /// does not recognise as a file. A numeric value here would render every folder as
        /// a file in the storage page.
        /// </summary>
        public string Type { get; set; } = string.Empty;

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

        public static ChildrenResponse From(VisibleChildrenPage page) => new()
        {
            Items = page.Items.Select(DmsItemMapper.From).ToList(),
            NextCursor = page.NextCursor,
            TotalChildCount = page.TotalChildCount,
            HasMore = page.HasMore,
        };
    }

    /// <summary>
    /// Maps the service-layer listing item onto the wire shape. Kept as a separate mapper
    /// rather than a method on <see cref="DmsItem"/> so the response type stays a plain
    /// contract with no dependency direction back into the services.
    /// </summary>
    public static class DmsItemMapper
    {
        public static DmsItem From(VisibleChildItem item) => new()
        {
            ItemId = item.ItemId,
            Name = item.Name,
            Type = ToKind(item.Type),
            ParentFolderId = item.ParentDirectoryId,
            SizeInBytes = item.SizeInBytes,
            CreatedDate = item.CreatedDate,
            LastUpdatedDate = item.LastUpdatedDate,
            CreatedBy = item.CreatedBy,
            Extension = item.Extension,
            ContentType = item.ContentType,
            Permissions = PermissionFlags.From(item.Permissions),
        };

        /// <summary>
        /// Maps the storage enum onto the contract string the client discriminates on. Kept
        /// here rather than on the enum so the response shape owns its own wire format.
        /// </summary>
        public static string ToKind(StructureType type) => type switch
        {
            StructureType.Directory => "folder",
            StructureType.File => "file",
            _ => "file",
        };
    }

    /// <summary>A folder with the operations the caller holds on it.</summary>
    public class FolderDetailResponse
    {
        public string ItemId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? ParentFolderId { get; set; }
        public string? Description { get; set; }
        public string FullPath { get; set; } = string.Empty;
        public List<string> AncestorIds { get; set; } = new();
        public bool InheritsParentAccess { get; set; }
        public int ChildFolderCount { get; set; }
        public int ChildFileCount { get; set; }
        public long SizeInBytes { get; set; }
        public string[]? AllowedFileExtensions { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime LastUpdatedDate { get; set; }
        public string? CreatedBy { get; set; }
        public PermissionFlags Permissions { get; set; } = new();

        public static FolderDetailResponse From(
            global::Storage.DomainService.Entities.Directory folder, ContentPermissionFlags? flags) => new()
        {
            ItemId = folder.ItemId,
            Name = folder.Name ?? string.Empty,
            ParentFolderId = string.IsNullOrWhiteSpace(folder.ParentDirectoryID) ? null : folder.ParentDirectoryID,
            Description = folder.Description,
            FullPath = folder.FullPath ?? string.Empty,
            AncestorIds = folder.AncestorIds ?? new List<string>(),
            InheritsParentAccess = folder.InheritsParentAccess,
            ChildFolderCount = folder.ChildFolderCount,
            ChildFileCount = folder.ChildFileCount,
            SizeInBytes = folder.SizeInBytes,
            AllowedFileExtensions = folder.AllowedFileExtensions,
            CreatedDate = folder.CreatedDate,
            LastUpdatedDate = folder.LastUpdatedDate,
            CreatedBy = folder.CreatedBy,
            Permissions = PermissionFlags.From(flags),
        };
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

    /// <summary>Returned by CreateFileVersion: the number assigned and the URL to PUT the bytes to.</summary>
    public class CreateFileVersionResponse
    {
        public long VersionNo { get; set; }
        public string? UploadUrl { get; set; }
        public bool IsSuccess { get; set; }
        public Dictionary<string, string>? Errors { get; set; }
    }
}
