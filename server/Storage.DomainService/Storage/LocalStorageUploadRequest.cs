using Blocks.Genesis;
using Microsoft.AspNetCore.Http;

namespace DomainService.Storage
{
    public class LocalStorageUploadRequest
    {
        /// <summary>
        /// command. ItemId: String representing the item ID.
        /// </summary>
        public string? ItemId { get; set; }
        /// <summary>
        /// command. MetaData: String representing abritrary structured data stored in file.
        /// </summary>
        public string MetaData { get; set; }
        /// <summary>
        /// command. Name: String representing the name of the file.
        /// </summary>
        public string Name { get; set; }
        /// <summary>
        /// command. ParentDirectoryId: String representing the parent directory ID of the file.
        /// </summary>
        public string ParentDirectoryId { get; set; }
        /// <summary>
        /// command. Tags: String representing the tags attached to the file.
        /// </summary>
        public string Tags { get; set; }
        /// <summary>
        /// command. AccessModifier: String representing the access modifier types available for the file.
        /// </summary>
        public string AccessModifier { get; set; } = "Private";

        /// <summary>
        /// "Creator" or "Organization": the default access this file grants when unshared.
        /// Null/empty preserves the pre-existing (allow-all) default.
        /// </summary>
        public string? ObjectAccessLevel { get; set; }

        /// <summary>Whether this file's effective access resolves by walking up to its parent
        /// directory's own rules. True by default; set false so a broad grant on an ancestor
        /// (e.g. shared with everyone) does not carry down to this file.</summary>
        public bool InheritsParentAccess { get; set; } = true;

        public string? ConfigurationName { get; set; } = null;
        public required IFormFile File { get; set; }
        public Dictionary<string, string> AdditionalProperties { get; set; } = new Dictionary<string, string>();
    }
}
