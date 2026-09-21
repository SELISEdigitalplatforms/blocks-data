using Storage.DomainService.Shared.Enums;

// Namespaced apart from the legacy storage DTOs: a CreateDirectoryRequest already
// exists there for the directory methods that SPEC B5 retires in the post-migration
// pass, and the two must coexist until that lands.
namespace DomainService.Storage.Dms
{
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

        /// <summary>"Creator" or "Organization". Null/empty preserves the pre-existing
        /// default (allow-all) rather than applying a new default.</summary>
        public string? ObjectAccessLevel { get; set; }

        /// <summary>Whether this directory's effective access resolves by walking up to its
        /// parent's own rules. True by default; set false so a broad grant on an ancestor
        /// (e.g. shared with everyone) does not carry down to this directory.</summary>
        public bool InheritsParentAccess { get; set; } = true;
    }
}
