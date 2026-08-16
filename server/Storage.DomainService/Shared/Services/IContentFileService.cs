namespace Storage.DomainService.Services
{
    public interface IContentFileService
    {
        Task<FileVersionPage> GetVersionsAsync(string fileId, string? cursor = null, int limit = 25, CancellationToken cancellationToken = default);
        Task<FileOperationResult> MoveFileAsync(string fileId, string targetDirectoryId, CancellationToken cancellationToken = default);
        Task<FileOperationResult> RenameFileAsync(string fileId, string name, CancellationToken cancellationToken = default);
        Task<FileOperationResult> CopyFileAsync(string fileId, string targetDirectoryId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default);
    }
}
