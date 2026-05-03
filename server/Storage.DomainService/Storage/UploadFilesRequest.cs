using Blocks.Genesis;

namespace Storage.DomainService.Storage
{
    public class UploadFilesRequest : IProjectKey
    {
        public List<UploadFileRequest> Upload { get; set; }
        public string? ProjectKey { get; set; }
    }

    public class UploadFileRequest : ArtifactBaseRequest
    {
        public string FileStorageId { get; set; }
    }

    public class CreateFolderRequest : ArtifactBaseRequest, IProjectKey 
    {
        public string FileStorageId { get; set; }
        public string? ProjectKey { get; set; }
    }
}
