using Blocks.Genesis;

namespace DomainService.Storage
{
    public class GetFileRequest : IProjectKey
    {
        /// <summary>
        /// command. FileId: String representing the file ID.
        /// </summary>
        public string FileId { get; set; }
        /// <summary>
        /// command. Version: Get the file version.
        /// </summary>
        public long? Version { get; set; }

        public string? ConfigurationName { get; set; } = null;
        public string? ProjectKey { get ; set ; }
    }
}
