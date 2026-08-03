using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services
{
    public interface IDirectoryRepository
    {
        Task CreateDirectoryAsync(Directory directory);
        Task CreateDirectoriesAsync(List<Directory> directories);
        Task<List<Directory>> GetDirectories(string directoryId);
        Task<Directory> GetDirectoryByItemIDAsync(string itemID);
        Task UpdateDirectory(Directory directory);

        /// <summary>
        /// Loads a directory by id within the caller's tenant. Archived directorys are excluded
        /// unless <paramref name="includeArchived"/> is set, so a trashed directory cannot be
        /// confused for a live one on the read paths that do not expect it.
        /// </summary>
        Task<Directory?> FindByIdAsync(string directoryId, bool includeArchived, CancellationToken cancellationToken = default);

        /// <summary>
        /// Keyset-paginated children of a directory. An empty <paramref name="parentId"/> lists
        /// root directorys. <paramref name="afterName"/>/<paramref name="afterId"/> continue from
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

        /// <summary>Raw, unfiltered child count for a directory, used as informational metadata.</summary>
        Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default);

        /// <summary>
        /// Returns every non-archived directory in the tenant that carries the given
        /// <paramref name="configurationName"/>. Used by the default-directory consumer to
        /// clone the template tree (seeded with <c>ConfigurationName "Azure"</c>) for a
        /// newly added storage configuration.
        /// </summary>
        Task<List<Directory>> GetByConfigurationNameAsync(string configurationName, CancellationToken cancellationToken = default);
    }
}
