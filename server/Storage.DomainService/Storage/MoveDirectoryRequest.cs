namespace DomainService.Storage.Dms
{
    public class MoveDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;

        /// <summary>Null or empty moves the directory to the top level.</summary>
        public string? TargetDirectoryId { get; set; }
    }
}
