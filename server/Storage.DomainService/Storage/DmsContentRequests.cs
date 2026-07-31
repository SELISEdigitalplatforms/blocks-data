using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

// Namespaced apart from the legacy storage DTOs: a CreateFolderRequest already
// exists there for the folder methods that SPEC B5 retires in the post-migration
// pass, and the two must coexist until that lands.
namespace DomainService.Storage.Dms
{
    // Request contracts for the DMS content endpoints. Grouped in one file because they
    // are a single cohesive set introduced together, matching how the repository already
    // groups closely related types.

    public class CreateFolderRequest
    {
        public string Name { get; set; } = string.Empty;

        /// <summary>Null or empty creates a folder at the top level.</summary>
        public string? ParentFolderId { get; set; }

        public string? Description { get; set; }
        public string? ConfigurationName { get; set; }
        public string? ModuleName { get; set; }

        /// <summary>Extensions this folder accepts. Empty means no restriction.</summary>
        public string[]? AllowedFileExtensions { get; set; }
    }

    public class UpdateFolderRequest
    {
        public string FolderId { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Description { get; set; }
    }

    public class GetFolderChildrenRequest
    {
        public string FolderId { get; set; } = string.Empty;

        /// <summary>Opaque continuation token from the previous page. Null starts at the beginning.</summary>
        public string? Cursor { get; set; }

        public int Limit { get; set; } = 50;

        /// <summary>Null returns folders and files together.</summary>
        public StructureType? Type { get; set; }

        public string? Search { get; set; }
    }

    public class CreateFileVersionRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string? ConfigurationName { get; set; }
    }

    public class CopyFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string TargetFolderId { get; set; } = string.Empty;

        /// <summary>When false the copy starts with no entries of its own and inherits from the target.</summary>
        public bool CopyAccessPolicies { get; set; }
    }

    public class MoveFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string TargetFolderId { get; set; } = string.Empty;
    }

    public class MoveFolderRequest
    {
        public string FolderId { get; set; } = string.Empty;

        /// <summary>Null or empty moves the folder to the top level.</summary>
        public string? TargetFolderId { get; set; }
    }

    public class GrantAccessRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ContentResourceType ResourceType { get; set; }
        public ContentPrincipalType PrincipalType { get; set; }

        /// <summary>Required for every principal kind except Everyone.</summary>
        public string? PrincipalId { get; set; }

        public ContentPermission Permission { get; set; }
        public ContentEffect Effect { get; set; } = ContentEffect.Allow;
        public int Priority { get; set; }
        public DateTime? ExpiresAt { get; set; }

        /// <summary>Set when updating an existing entry rather than creating one.</summary>
        public string? PolicyItemId { get; set; }
    }

    public class RevokeAccessRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public string PolicyItemId { get; set; } = string.Empty;
    }

    public class ToggleInheritanceRequest
    {
        public string ResourceId { get; set; } = string.Empty;

        /// <summary>
        /// Switching this off is rejected unless the resource already carries an allow
        /// entry of its own, since it would otherwise be visible to nobody.
        /// </summary>
        public bool InheritsParentAccess { get; set; }
    }

    public class ContentSearchRequest
    {
        public string Query { get; set; } = string.Empty;

        /// <summary>Null searches from the top level down.</summary>
        public string? FolderId { get; set; }

        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;
        public StructureType? Type { get; set; }
    }

    public class TrashRequest
    {
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Narrows the trash to folders or files. Both when omitted.</summary>
        public StructureType? Type { get; set; }
    }

    /// <summary>
    /// Deletes a folder. Named apart from the legacy <c>DeleteFolderRequest</c> in the
    /// storage namespace, which the post-migration pass retires.
    /// </summary>
    public class DeleteFolderContentRequest
    {
        public string FolderId { get; set; } = string.Empty;

        /// <summary>Removes the folder outright instead of moving it to the trash.</summary>
        public bool Permanent { get; set; }
    }

    /// <summary>Permanently removes an item that is already in the trash.</summary>
    public class DeleteFromTrashRequest
    {
        public string ResourceId { get; set; } = string.Empty;
    }

    /// <summary>Reads the access entries on one resource.</summary>
    public class GetAccessPoliciesRequest
    {
        public string ResourceId { get; set; } = string.Empty;

        /// <summary>Includes entries inherited from ancestors alongside the resource's own.</summary>
        public bool IncludeInherited { get; set; } = true;
    }

    /// <summary>Grants a principal an allow entry and records it as a share.</summary>
    public class ShareContentRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ContentResourceType ResourceType { get; set; }
        public ContentPrincipalType PrincipalType { get; set; }
        public string? PrincipalId { get; set; }
        public ContentPermission Permission { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    public class RestoreFromTrashRequest
    {
        public string ResourceId { get; set; } = string.Empty;
    }

    public class GetFileVersionsRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 25;
    }
}
