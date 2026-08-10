using Storage.DomainService.Entities;
using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services;

public interface IDirectoryManagementService
{
    /// <summary>
    /// Creates a directory. A root directory is gated at the endpoint by
    /// <c>blocks-data::create-root-directory</c>; a nested directory additionally requires
    /// Edit on the parent, which is checked here.
    /// </summary>
    Task<DirectoryOperationResult> CreateDirectoryAsync(
        string name,
        string? parentDirectoryId,
        string? description = null,
        string? configurationName = null,
        string? moduleName = null,
        string[]? allowedFileExtensions = null,
        CancellationToken cancellationToken = default);

    /// <summary>The directory plus the operations the caller holds on it.</summary>
    Task<DirectoryOperationResult> GetDirectoryAsync(string directoryId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Finds the default directory assigned to a module. Legacy default directories use
    /// <c>Description</c> for the module key; newer ones use <c>ModuleName</c>.
    /// </summary>
    Task<Directory?> GetDefaultDirectoryByModuleNameAsync(string moduleName, CancellationToken cancellationToken = default);

    Task<DirectoryOperationResult> UpdateDirectoryAsync(
        string directoryId, string? name, string? description, CancellationToken cancellationToken = default);

    /// <summary>Moves the directory to the trash, or permanently removes its entire subtree.</summary>
    Task<DirectoryOperationResult> DeleteDirectoryAsync(
        string directoryId, bool permanent = true, CancellationToken cancellationToken = default);
}
