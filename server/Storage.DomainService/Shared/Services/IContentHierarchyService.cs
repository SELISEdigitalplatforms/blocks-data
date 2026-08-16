using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace Storage.DomainService.Services
{
    public interface IContentHierarchyService
    {
        Task<List<FileDirectory>> GetAncestorsAsync(string directoryId, CancellationToken cancellationToken = default);
        Task<int> RebuildAncestorPathsAsync(string directoryId, CancellationToken cancellationToken = default);
        Task<MoveDirectoryResult> MoveDirectoryAsync(string directoryId, string? newParentId, CancellationToken cancellationToken = default);
    }
}
