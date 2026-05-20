using Blocks.Genesis;

namespace DomainService.Storage
{
    public class DownloadFileResponse : BaseResponse
    {
        public string FileName { get; set; }
        public string FileId { get; set; }
        public long FileVersion { get; set; }
        public Stream? FileStream { get; set; }
    }
}
