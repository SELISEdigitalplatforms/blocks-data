namespace DomainService.Storage.Dms
{
    public class RenameFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
