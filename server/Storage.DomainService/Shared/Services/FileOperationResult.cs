namespace Storage.DomainService.Services
{
    public sealed class FileOperationResult
    {
        public FileOperationStatus Status { get; init; }
        public string? NewFileId { get; init; }
        public static FileOperationResult Failure(FileOperationStatus status) => new() { Status = status };
    }
}
