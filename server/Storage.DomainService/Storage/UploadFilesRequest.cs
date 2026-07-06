using Blocks.Genesis;

namespace Storage.DomainService.Storage
{
    public class UploadFilesRequest
    {
        public List<UploadFileRequest> Upload { get; set; }
    }

    public class UploadFileRequest : ArtifactBaseRequest
    {
        public string FileStorageId { get; set; }
    }

    public class CreateFolderRequest : ArtifactBaseRequest
    {
        public string FileStorageId { get; set; }
    }
}
