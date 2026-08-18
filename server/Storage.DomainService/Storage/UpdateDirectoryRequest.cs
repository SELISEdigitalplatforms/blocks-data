namespace DomainService.Storage.Dms
{
    public class UpdateDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Description { get; set; }
    }
}
