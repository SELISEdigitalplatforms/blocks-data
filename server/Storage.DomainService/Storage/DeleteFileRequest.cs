using Blocks.Genesis;

namespace DomainService.Storage
{
    public class DeleteFileRequest
    {
        public string FileId { get; set; }
        public string? ConfigurationName { get; set; } = null;
        public string? EventQueueName { get; set; }
        /// <summary>
        /// When false, the file is moved to trash and can later be restored or permanently
        /// removed through the content-trash endpoints. Permanent deletion is the default.
        /// </summary>
        public bool Permanent { get; set; } = true;
    }
}
