namespace DomainService.Storage.Dms
{
    public class CreateFileVersionRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string? ConfigurationName { get; set; }
    }
}
