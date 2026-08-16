namespace DomainService.Storage.Dms
{
    public class MoveFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string TargetDirectoryId { get; set; } = string.Empty;
    }
}
