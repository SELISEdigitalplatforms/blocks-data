using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public interface IFileVersionRepository
    {
        Task DeleteFileVersionsAsync(string fileId);
        Task CreateFileVersionAsync(FileVersion fileVersion);
        IEnumerable<string> GetFileVersionIds(string fileId);
        IEnumerable<FileVersion> GetFileVersions(string fileId);
        Task<long> GetLatestFileVersionNumberAsync(string fileId);
    }
}
