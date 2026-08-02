using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services
{
    public interface IDirectoryRepository
    {
        Task CreateDirectoryAsync(Directory directory);
        Task<List<Directory>> GetDirectories(string directoryId);
        Task<Directory> GetDirectoryByItemIDAsync(string itemID);
        Task UpdateDirectory(Directory directory);

        /// <summary>
        /// Loads a folder by id within the caller's tenant. Archived folders are excluded
        /// unless <paramref name="includeArchived"/> is set, so a trashed folder cannot be
        /// confused for a live one on the read paths that do not expect it.
        /// </summary>
        Task<Directory?> FindByIdAsync(string folderId, bool includeArchived, CancellationToken cancellationToken = default);

        /// <summary>
        /// Keyset-paginated children of a folder. An empty <paramref name="parentId"/> lists
        /// root folders. <paramref name="afterName"/>/<paramref name="afterId"/> continue from
        /// a previous page boundary; null starts at the beginning. Returned sorted by name then
        /// id, the same key the cursor encodes.
        /// </summary>
        Task<List<Directory>> FindChildrenAsync(
            string parentId,
            string? afterName,
            string? afterId,
            int take,
            string? search,
            CancellationToken cancellationToken = default);

        /// <summary>Raw, unfiltered child count for a folder, used as informational metadata.</summary>
        Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default);
    }
}
