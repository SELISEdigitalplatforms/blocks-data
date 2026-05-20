using Blocks.Genesis;

namespace DomainService.Storage
{
    public class GetFilesRequest : IProjectKey
    {
        /// <summary>
        /// command. FileId: String representing the file ID.
        /// </summary>
        public string[] FileIds { get; set; }
        public string? ConfigurationName { get; set; } = null;
        public string? ProjectKey { get ; set ; }
    }
}
