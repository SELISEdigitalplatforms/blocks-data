using Blocks.Genesis;

namespace DomainService.Storage
{
    public class DeleteFileRequest
    {
        public string FileId { get; set; }
        public string? ConfigurationName { get; set; } = null;
        public string? EventQueueName { get; set; }
    }
}
