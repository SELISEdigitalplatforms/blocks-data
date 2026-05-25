using Blocks.Genesis;

namespace DomainService.Storage
{
    public class LocalStorageUploadResponse : BaseResponse
    {
        public string FileId { get; set; } = string.Empty;
        public long FileVersion { get; set; }
    }
}
