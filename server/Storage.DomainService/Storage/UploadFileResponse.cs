namespace Storage.DomainService.Storage
{
    public class UploadFileResponse
    {
        public string FileStorageId { get; set; }
        public bool Success { get; set; }
    }
   
    public class CreateFolderResponse
    {
        public bool Success { get; set; }
    }
}
