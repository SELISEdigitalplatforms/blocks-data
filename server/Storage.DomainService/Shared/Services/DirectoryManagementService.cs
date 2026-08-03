using Blocks.Genesis;
using DomainService.Storage;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>Why a directory operation was refused, so callers can map it to a status code.</summary>
    public enum DirectoryOperationStatus
    {
        Succeeded = 0,
        NotFound = 1,
        /// <summary>The caller lacks the permission the operation requires.</summary>
        NotPermitted = 2,
        /// <summary>A sibling already uses this name.</summary>
        NameConflict = 3,
        ParentNotFound = 4,
        /// <summary>Permanent deletion refused because the directory still has children.</summary>
        NotEmpty = 5,
        /// <summary>
        /// The directory is a default/system root (seeded from a template). It anchors the
        /// tenant tree and cannot be moved, renamed or deleted.
        /// </summary>
        IsDefault = 6,
    }

    public sealed class DirectoryOperationResult
    {
        public DirectoryOperationStatus Status { get; init; }
        public string? DirectoryId { get; init; }
        public Directory? Directory { get; init; }
        public ContentPermissionFlags? Permissions { get; init; }
        public bool IsSuccess => Status == DirectoryOperationStatus.Succeeded;

        public static DirectoryOperationResult Failure(DirectoryOperationStatus status) => new() { Status = status };

        public static DirectoryOperationResult Success(
            string? directoryId = null, Directory? directory = null, ContentPermissionFlags? permissions = null) =>
            new()
            {
                Status = DirectoryOperationStatus.Succeeded,
                DirectoryId = directoryId,
                Directory = directory,
                Permissions = permissions,
            };
    }

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

        Task<DirectoryOperationResult> UpdateDirectoryAsync(
            string directoryId, string? name, string? description, CancellationToken cancellationToken = default);

        /// <summary>
        /// Moves the directory to the trash, or removes it outright when
        /// <paramref name="permanent"/> is set. Permanent deletion is refused while the
        /// directory still has children, so a subtree cannot be lost in one call.
        /// </summary>
        Task<DirectoryOperationResult> DeleteDirectoryAsync(
            string directoryId, bool permanent = true, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Directory lifecycle: create, read, rename and delete.
    /// </summary>
    /// <remarks>
    /// Directory operations live here rather than on <c>FileManagementService</c>, which now
    /// owns only file-level concerns.
    ///
    /// Deletion is soft by default. Permanent deletion refuses a directory that still has
    /// children rather than cascading, because a cascade behind a single request is how a
    /// subtree disappears by accident; the caller empties the directory first, or the trash
    /// keeps it recoverable.
    /// </remarks>
    public class DirectoryManagementService : IDirectoryManagementService
    {
        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessResolver _resolver;
        private readonly IContentAccessRepository _accessRepository;
        private readonly IFileManagementService _fileManagementService;

        public DirectoryManagementService(
            IDbContextProvider dbContextProvider,
            IContentAccessResolver resolver,
            IContentAccessRepository accessRepository,
            IFileManagementService fileManagementService)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
            _accessRepository = accessRepository;
            _fileManagementService = fileManagementService;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<Directory> Directories => _dbContextProvider.GetCollection<Directory>("Directories");
        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");

        public async Task<DirectoryOperationResult> CreateDirectoryAsync(
            string name,
            string? parentDirectoryId,
            string? description = null,
            string? configurationName = null,
            string? moduleName = null,
            string[]? allowedFileExtensions = null,
            CancellationToken cancellationToken = default)
        {
            var systemName = ToSystemName(name);
            Directory? parent = null;

            if (!string.IsNullOrWhiteSpace(parentDirectoryId))
            {
                parent = await LoadDirectoryAsync(parentDirectoryId!, cancellationToken);
                if (parent is null)
                {
                    return DirectoryOperationResult.Failure(DirectoryOperationStatus.ParentNotFound);
                }

                if (!await _resolver.ResolveAsync(Describe(parent), ContentPermission.Edit, cancellationToken))
                {
                    await AuditAsync(parent.ItemId, ContentResourceType.Directory, "Edit", false,
                        $"create directory '{name}' refused", cancellationToken);
                    return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotPermitted);
                }
            }

            if (await SiblingNameTakenAsync(parentDirectoryId, systemName, null, cancellationToken))
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NameConflict);
            }

            var ancestorIds = parent is null
                ? new List<string>()
                : new List<string>(parent.AncestorIds) { parent.ItemId };

            var directory = Directory.CreateNew(new DirectoryOptions
            {
                ItemId = Guid.NewGuid().ToString(),
                Name = name,
                ParentId = parentDirectoryId ?? string.Empty,
                TenantId = TenantId,
                CreatedBy = UserId,
                CreateDate = DateTime.UtcNow,
                AncestorIds = ancestorIds,
                FullPath = BuildPath(parent?.FullPath, name),
                Description = description,
                ConfigurationName = configurationName,
                ModuleName = moduleName,
                AllowedFileExtensions = allowedFileExtensions ?? Array.Empty<string>(),
            });

            // CreateNew derives SystemName from the untrimmed name; set it from the same
            // value the uniqueness check used so the two can never drift.
            directory.SystemName = systemName;

            await Directories.InsertOneAsync(directory, cancellationToken: cancellationToken);

            if (parent is not null)
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, parent.ItemId),
                    Builders<Directory>.Update.Inc(d => d.ChildDirectoryCount, 1),
                    cancellationToken: cancellationToken);
            }

            await AuditAsync(directory.ItemId, ContentResourceType.Directory, "Edit", true, "directory created", cancellationToken);

            return DirectoryOperationResult.Success(directory.ItemId, directory);
        }

        public async Task<DirectoryOperationResult> GetDirectoryAsync(string directoryId, CancellationToken cancellationToken = default)
        {
            var directory = await LoadDirectoryAsync(directoryId, cancellationToken);
            if (directory is null)
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotFound);
            }

            var flags = await _resolver.ResolveFlagsAsync(Describe(directory), cancellationToken);
            if (!flags.CanView)
            {
                // Refused reads report NotFound rather than NotPermitted, so a caller cannot
                // use this endpoint to discover that a directory exists.
                await AuditAsync(directoryId, ContentResourceType.Directory, "View", false, null, cancellationToken);
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotFound);
            }

            return DirectoryOperationResult.Success(directory.ItemId, directory, flags);
        }

        public async Task<DirectoryOperationResult> UpdateDirectoryAsync(
            string directoryId, string? name, string? description, CancellationToken cancellationToken = default)
        {
            var directory = await LoadDirectoryAsync(directoryId, cancellationToken);
            if (directory is null)
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotFound);
            }

            // Default directories are system roots: their name is part of the tenant
            // contract, so renaming them is refused outright.
            if (IsDefaultDirectory(directory))
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.IsDefault);
            }

            if (!await _resolver.ResolveAsync(Describe(directory), ContentPermission.Edit, cancellationToken))
            {
                await AuditAsync(directoryId, ContentResourceType.Directory, "Edit", false, null, cancellationToken);
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotPermitted);
            }

            var updates = new List<UpdateDefinition<Directory>>();
            var renamed = !string.IsNullOrWhiteSpace(name) && !string.Equals(name, directory.Name, StringComparison.Ordinal);

            if (renamed)
            {
                var systemName = ToSystemName(name!);
                if (await SiblingNameTakenAsync(directory.ParentId, systemName, directory.ItemId, cancellationToken))
                {
                    return DirectoryOperationResult.Failure(DirectoryOperationStatus.NameConflict);
                }

                updates.Add(Builders<Directory>.Update.Set(d => d.Name, name));
                updates.Add(Builders<Directory>.Update.Set(d => d.SystemName, systemName));
                updates.Add(Builders<Directory>.Update.Set(d => d.FullPath, RenameLeaf(directory.FullPath, name!)));
            }

            if (description is not null)
            {
                updates.Add(Builders<Directory>.Update.Set(d => d.Description, description));
            }

            if (updates.Count == 0)
            {
                return DirectoryOperationResult.Success(directory.ItemId, directory);
            }

            updates.Add(Builders<Directory>.Update.Set(d => d.LastUpdatedBy, UserId));
            updates.Add(Builders<Directory>.Update.Set(d => d.LastUpdatedDate, DateTime.UtcNow));

            await Directories.UpdateOneAsync(
                Builders<Directory>.Filter.Eq(d => d.ItemId, directory.ItemId),
                Builders<Directory>.Update.Combine(updates),
                cancellationToken: cancellationToken);

            await AuditAsync(directoryId, ContentResourceType.Directory, "Edit", true,
                renamed ? $"renamed to '{name}'" : "metadata updated", cancellationToken);

            // A rename changes the stored path of every descendant. Callers that care about
            // descendant paths run the hierarchy rebuild; it is not done inline because a
            // rename near the root would turn one request into an unbounded write.
            return DirectoryOperationResult.Success(directory.ItemId, directory);
        }

        public async Task<DirectoryOperationResult> DeleteDirectoryAsync(
            string directoryId, bool permanent = true, CancellationToken cancellationToken = default)
        {
            var directory = await LoadDirectoryAsync(directoryId, cancellationToken, includeArchived: true);
            if (directory is null)
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotFound);
            }

            // Default directories are system roots: deleting one would unanchor the
            // tenant tree, so it is refused regardless of permissions.
            if (IsDefaultDirectory(directory))
            {
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.IsDefault);
            }

            if (!await _resolver.ResolveAsync(Describe(directory), ContentPermission.Delete, cancellationToken))
            {
                await AuditAsync(directoryId, ContentResourceType.Directory, "Delete", false, null, cancellationToken);
                return DirectoryOperationResult.Failure(DirectoryOperationStatus.NotPermitted);
            }

            if (permanent)
            {
                // Cascade: permanently delete the directory and every descendant
                // (subdirectories and files) in one pass. Descendants are identified via
                // the cached AncestorIds array, which contains the deleted directory's id.
                var descendantDirectoryFilter = Builders<Directory>.Filter.Or(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, directoryId),
                    Builders<Directory>.Filter.AnyEq(d => d.AncestorIds, directoryId));
                var doomedDirectories = await (await Directories.FindAsync(descendantDirectoryFilter, cancellationToken: cancellationToken))
                    .ToListAsync(cancellationToken);
                var doomedDirectoryIds = doomedDirectories.Select(d => d.ItemId).ToList();

                // Delete every descendant file through the file-management service so that
                // the stored object (Azure/S3/local), the FileVersion rows, and the File
                // document are all removed. Each file carries its own ConfigurationName,
                // so the correct storage provider is resolved per file.
                var doomedFiles = await (await Files.FindAsync(
                    Builders<File>.Filter.Or(
                        Builders<File>.Filter.AnyIn(f => f.AncestorIds, doomedDirectoryIds),
                        Builders<File>.Filter.In(f => f.DirectoryId, doomedDirectoryIds)),
                    cancellationToken: cancellationToken))
                    .ToListAsync(cancellationToken);

                foreach (var file in doomedFiles)
                {
                    await _fileManagementService.DeleteFileAsync(new DeleteFileRequest
                    {
                        FileId = file.ItemId,
                        ConfigurationName = file.ConfigurationName,
                    });
                }

                foreach (var id in doomedDirectoryIds)
                {
                    await _accessRepository.RevokeAllForResourceAsync(id, cancellationToken);
                }

                // Delete the directory and all its subdirectories.
                await Directories.DeleteManyAsync(descendantDirectoryFilter, cancellationToken);

                await AuditAsync(directoryId, ContentResourceType.Directory, "Delete", true, "permanent (cascade)", cancellationToken);
            }
            else
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, directoryId),
                    Builders<Directory>.Update
                        .Set(d => d.IsArchived, true)
                        .Set(d => d.LastUpdatedBy, UserId)
                        .Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                    cancellationToken: cancellationToken);
                await AuditAsync(directoryId, ContentResourceType.Directory, "Delete", true, "trashed", cancellationToken);
            }

            if (!string.IsNullOrWhiteSpace(directory.ParentId))
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, directory.ParentId),
                    Builders<Directory>.Update.Inc(d => d.ChildDirectoryCount, -1),
                    cancellationToken: cancellationToken);
            }

            return DirectoryOperationResult.Success(directoryId);
        }

        private async Task<Directory?> LoadDirectoryAsync(
            string directoryId, CancellationToken cancellationToken, bool includeArchived = false)
        {
            var filter = Builders<Directory>.Filter.Eq(d => d.ItemId, directoryId);

            if (!includeArchived)
            {
                filter &= Builders<Directory>.Filter.Eq(d => d.IsArchived, false);
            }

            return await (await Directories.FindAsync(filter, cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);
        }

        /// <summary>
        /// A directory counts as a default/system root when its <see cref="BaseEntity.Tags"/>
        /// array contains the marker <c>"default"</c>. Default directories are cloned from the
        /// seed templates (Cloud/Construct/etc) which tag themselves this way; user-created
        /// directories never carry the tag, so it is a stable marker for "this anchors the
        /// tenant tree". Such directories cannot be moved, renamed or deleted.
        /// </summary>
        private static bool IsDefaultDirectory(Directory directory)
            => directory.Tags?.Contains("default", StringComparer.OrdinalIgnoreCase) == true;

        private async Task<bool> SiblingNameTakenAsync(
            string? parentDirectoryId, string systemName, string? excludingItemId, CancellationToken cancellationToken)
        {
            // Directory.CreateNew stores a root directory's parent as null, not "". Comparing
            // against "" here would mean no root directory ever matched another, so duplicate
            // root names would all be accepted.
            var parentFilter = string.IsNullOrWhiteSpace(parentDirectoryId)
                ? Builders<Directory>.Filter.Eq(d => d.ParentId, null)
                : Builders<Directory>.Filter.Eq(d => d.ParentId, parentDirectoryId);

            var filter = Builders<Directory>.Filter.And(
                parentFilter,
                Builders<Directory>.Filter.Eq(d => d.SystemName, systemName),
                Builders<Directory>.Filter.Eq(d => d.IsArchived, false));

            if (!string.IsNullOrWhiteSpace(excludingItemId))
            {
                filter &= Builders<Directory>.Filter.Ne(d => d.ItemId, excludingItemId);
            }

            return await Directories.CountDocumentsAsync(filter, cancellationToken: cancellationToken) > 0;
        }

        private async Task<bool> HasChildrenAsync(string directoryId, CancellationToken cancellationToken)
        {
            var directorys = await Directories.CountDocumentsAsync(
                Builders<Directory>.Filter.And(
                    Builders<Directory>.Filter.Eq(d => d.ParentId, directoryId)),
                cancellationToken: cancellationToken);

            if (directorys > 0)
            {
                return true;
            }

            return await Files.CountDocumentsAsync(
                Builders<File>.Filter.Eq(f => f.DirectoryId, directoryId),
                cancellationToken: cancellationToken) > 0;
        }

        private static ContentResourceDescriptor Describe(Directory directory) => new()
        {
            ResourceId = directory.ItemId,
            AncestorIds = directory.AncestorIds ?? new List<string>(),
            InheritsParentAccess = directory.InheritsParentAccess,
            CreatedBy = directory.CreatedBy,
        };

        /// <summary>
        /// The lookup key for sibling uniqueness. This has to match what
        /// <see cref="Directory.CreateNew(DirectoryOptions)"/> stores, which is the name
        /// lowercased, or the duplicate check would compare against a value that is never
        /// written and silently allow two siblings with the same name.
        /// </summary>
        public static string ToSystemName(string name) => (name ?? string.Empty).Trim().ToLowerInvariant();

        public static string BuildPath(string? parentPath, string name) =>
            string.IsNullOrWhiteSpace(parentPath) ? $"/{name}" : $"{parentPath.TrimEnd('/')}/{name}";

        public static string RenameLeaf(string? fullPath, string newName)
        {
            if (string.IsNullOrWhiteSpace(fullPath))
            {
                return $"/{newName}";
            }

            var lastSlash = fullPath.LastIndexOf('/');
            return lastSlash <= 0 ? $"/{newName}" : $"{fullPath[..lastSlash]}/{newName}";
        }

        private Task AuditAsync(
            string resourceId, ContentResourceType resourceType, string action, bool granted,
            string? detail, CancellationToken cancellationToken) =>
            _accessRepository.WriteAuditAsync(new ContentAuditLog
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = TenantId,
                ResourceId = resourceId,
                ResourceType = resourceType,
                UserId = UserId,
                Action = action,
                Granted = granted,
                Detail = detail,
                CreatedDate = DateTime.UtcNow,
            }, cancellationToken);
    }
}
