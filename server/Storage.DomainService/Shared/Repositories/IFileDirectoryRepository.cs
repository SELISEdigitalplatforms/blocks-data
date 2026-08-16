using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace Storage.DomainService.Services
{
    public interface IFileDirectoryRepository
    {
        Task CreateDirectoryAsync(FileDirectory directory);
        Task CreateDirectoriesAsync(List<FileDirectory> directories);
        Task<List<FileDirectory>> GetDirectories(string directoryId);
        Task<FileDirectory> GetDirectoryByItemIDAsync(string itemID);

        /// <summary>
        /// Finds the default directory assigned to a module. Legacy default-directory data
        /// stores the module key in <c>Description</c>; newer data may use
        /// <c>ModuleName</c>, so implementations must support both forms.
        /// </summary>
        Task<FileDirectory?> GetDefaultDirectoryByModuleNameAsync(string moduleName, CancellationToken cancellationToken = default);
        Task UpdateDirectory(FileDirectory directory);

        /// <summary>
        /// Loads a directory by id within the caller's tenant. Archived directorys are excluded
        /// unless <paramref name="includeArchived"/> is set, so a trashed directory cannot be
        /// confused for a live one on the read paths that do not expect it.
        /// </summary>
        Task<FileDirectory?> FindByIdAsync(string directoryId, bool includeArchived, CancellationToken cancellationToken = default);

        /// <summary>
        /// Keyset-paginated children of a directory. An empty <paramref name="parentId"/> lists
        /// root directorys. <paramref name="afterName"/>/<paramref name="afterId"/> continue from
        /// a previous page boundary; null starts at the beginning. Returned sorted by name then
        /// id, the same key the cursor encodes.
        /// </summary>
        Task<List<FileDirectory>> FindChildrenAsync(
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
        Task<List<FileDirectory>> GetByConfigurationNameAsync(string configurationName, CancellationToken cancellationToken = default);
    }
}
