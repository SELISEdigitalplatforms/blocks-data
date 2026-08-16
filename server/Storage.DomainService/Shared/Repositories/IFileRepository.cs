
using Blocks.Genesis;
using DomainService.Storage;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Dtos;
using Storage.DomainService.Entities;
using Storage.DomainService.Storage;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public interface IFileRepository
    {
        Task CreateFileAsync(File file);
        Task UpdateFileAsync(File file);
        Task DeleteFileAsync(File file);
        Task<File> GetFileByItemIdAsync(string itemId);
        Task<File> GetFileByItemIdAsync(string itemId, string tenantId);
        (IEnumerable<BsonDocument>, FileResponse[]) GetRequiredFiles(IEnumerable<string> fileIds, long? version);
        Task<(IQueryable<T>?, long)> GetFilesInfoAsync<T, R>(R query) where R : BaseGetsRequest<GetFilesInfoFilter>;
        Task<FileVersion> GetFileVersions(string fileStorageId);
        Task DeleteFilesAsync(IEnumerable<File> files);

        /// <summary>
        /// Keyset-paginated child files of a directory. An empty <paramref name="parentId"/> lists
        /// files parked at the root level. <paramref name="afterName"/>/<paramref name="afterId"/>
        /// continue from a previous page boundary; null starts at the beginning. Returned sorted
        /// by name then id, the same key the cursor encodes.
        /// </summary>
        Task<List<File>> FindChildrenAsync(
            string parentId,
            string? afterName,
            string? afterId,
            int take,
            string? search,
            CancellationToken cancellationToken = default);

        /// <summary>Raw, unfiltered child file count for a directory, used as informational metadata.</summary>
        Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default);
    }
}
