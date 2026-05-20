using Blocks.Genesis;

namespace DomainService.Storage
{
    public class DeleteFileRequest : IProjectKey
    {
        public string FileId { get; set; }
        public string? ConfigurationName { get; set; } = null;
        public string? ProjectKey { get ; set ; }
        public string? EventQueueName { get; set; }
    }
}
