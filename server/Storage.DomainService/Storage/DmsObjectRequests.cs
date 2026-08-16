using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Shared.Enums;

// Namespaced apart from the legacy storage DTOs: a CreateDirectoryRequest already
// exists there for the directory methods that SPEC B5 retires in the post-migration
// pass, and the two must coexist until that lands.
namespace DomainService.Storage.Dms
{
    // Request contracts for the DMS object endpoints. Grouped in one file because they
    // are a single cohesive set introduced together, matching how the repository already
    // groups closely related types.

    public class CreateDirectoryRequest
    {
        public string Name { get; set; } = string.Empty;

        /// <summary>Null or empty creates a directory at the top level.</summary>
        public string? ParentDirectoryId { get; set; }

        public string? Description { get; set; }
        public string? ConfigurationName { get; set; }
        public ModuleName? ModuleName { get; set; }

        /// <summary>Extensions this directory accepts. Empty means no restriction.</summary>
        public string[]? AllowedFileExtensions { get; set; }
    }

    public class UpdateDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Description { get; set; }
    }

    public class GetObjectRequest
    {
        public string? ParentDirectoryId { get; set; }

        /// <summary>
        /// Optional module root to list when <see cref="DirectoryId"/> is not supplied.
        /// The API resolves this to the module's default directory before listing.
        /// </summary>
        /// <summary>Opaque continuation token from the previous page. Null starts at the beginning.</summary>
        public string? Cursor { get; set; }

        public int Limit { get; set; } = 50;

        /// <summary>Null returns directorys and files together. Accepts the API kind strings "directory" / "file".</summary>
        public string? Type { get; set; }

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
        public string TargetDirectoryId { get; set; } = string.Empty;

        /// <summary>When false the copy starts with no entries of its own and inherits from the target.</summary>
        public bool CopyAccessPolicies { get; set; }
    }

    public class MoveFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string TargetDirectoryId { get; set; } = string.Empty;
    }

    public class RenameFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class MoveDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;

        /// <summary>Null or empty moves the directory to the top level.</summary>
        public string? TargetDirectoryId { get; set; }
    }

    public class GrantAccessRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ObjectResourceType ResourceType { get; set; }
        public ObjectPrincipalType PrincipalType { get; set; }

        /// <summary>Required for every principal kind except Everyone.</summary>
        public string? PrincipalId { get; set; }

        public ObjectPermission Permission { get; set; }
        public ObjectEffect Effect { get; set; } = ObjectEffect.Allow;
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

    public class ObjectSearchRequest
    {
        public string Query { get; set; } = string.Empty;

        /// <summary>Null searches from the top level down.</summary>
        public string? DirectoryId { get; set; }

        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Null searches directorys and files together. Accepts "directory" / "file".</summary>
        public string? Type { get; set; }
    }

    public class TrashRequest
    {
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Narrows the trash to directorys or files. Both when omitted. Accepts "directory" / "file".</summary>
        public string? Type { get; set; }
    }

    /// <summary>Cursor-paginated objects explicitly shared with the calling principal.</summary>
    public class SharedObjectRequest
    {
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Narrows results to directorys or files. Both when omitted.</summary>
        public string? Type { get; set; }
    }

    /// <summary>
    /// Deletes a directory. Named apart from the legacy <c>DeleteDirectoryRequest</c> in the
    /// storage namespace, which the post-migration pass retires.
    /// </summary>
    public class DeleteDirectoryObjectRequest
    {
        public string DirectoryId { get; set; } = string.Empty;

        /// <summary>Removes the directory outright instead of moving it to the trash.</summary>
        public bool Permanent { get; set; } = true;
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
    public class ShareObjectRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ObjectResourceType ResourceType { get; set; }
        public ObjectPrincipalType PrincipalType { get; set; }
        public string? PrincipalId { get; set; }
        public ObjectPermission Permission { get; set; }
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

    /// <summary>
    /// Maps the API kind strings the frontend sends ("directory" / "file") onto the
    /// <see cref="StructureType"/> the listing/search services filter on. Any other
    /// value (null, empty, "all", typos) resolves to null, which the services read as
    /// "no filter" — matching the contract where an omitted type returns both kinds.
    /// </summary>
    public static class ObjectKind
    {
        public static StructureType? FromApiString(string? value)
            => value?.Trim().ToLowerInvariant() switch
            {
                "directory" => StructureType.Directory,
                "file" => StructureType.File,
                _ => null,
            };
    }
}
