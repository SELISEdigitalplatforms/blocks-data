using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>Why a folder operation was refused, so callers can map it to a status code.</summary>
    public enum FolderOperationStatus
    {
        Succeeded = 0,
        NotFound = 1,
        /// <summary>The caller lacks the permission the operation requires.</summary>
        NotPermitted = 2,
        /// <summary>A sibling already uses this name.</summary>
        NameConflict = 3,
        ParentNotFound = 4,
        /// <summary>Permanent deletion refused because the folder still has children.</summary>
        NotEmpty = 5,
    }

    public sealed class FolderOperationResult
    {
        public FolderOperationStatus Status { get; init; }
        public string? FolderId { get; init; }
        public Directory? Folder { get; init; }
        public ContentPermissionFlags? Permissions { get; init; }
        public bool IsSuccess => Status == FolderOperationStatus.Succeeded;

        public static FolderOperationResult Failure(FolderOperationStatus status) => new() { Status = status };

        public static FolderOperationResult Success(
            string? folderId = null, Directory? folder = null, ContentPermissionFlags? permissions = null) =>
            new()
            {
                Status = FolderOperationStatus.Succeeded,
                FolderId = folderId,
                Folder = folder,
                Permissions = permissions,
            };
    }

    public interface IFolderManagementService
    {
        /// <summary>
        /// Creates a folder. A root folder is gated at the endpoint by
        /// <c>blocks-data::create-root-folder</c>; a nested folder additionally requires
        /// Edit on the parent, which is checked here.
        /// </summary>
        Task<FolderOperationResult> CreateFolderAsync(
            string name,
            string? parentFolderId,
            string? description = null,
            string? configurationName = null,
            string? moduleName = null,
            string[]? allowedFileExtensions = null,
            CancellationToken cancellationToken = default);

        /// <summary>The folder plus the operations the caller holds on it.</summary>
        Task<FolderOperationResult> GetFolderAsync(string folderId, CancellationToken cancellationToken = default);

        Task<FolderOperationResult> UpdateFolderAsync(
            string folderId, string? name, string? description, CancellationToken cancellationToken = default);

        /// <summary>
        /// Moves the folder to the trash, or removes it outright when
        /// <paramref name="permanent"/> is set. Permanent deletion is refused while the
        /// folder still has children, so a subtree cannot be lost in one call.
        /// </summary>
        Task<FolderOperationResult> DeleteFolderAsync(
            string folderId, bool permanent = false, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Folder lifecycle: create, read, rename and delete.
    /// </summary>
    /// <remarks>
    /// Folder operations live here rather than on <c>FileManagementService</c>, which now
    /// owns only file-level concerns.
    ///
    /// Deletion is soft by default. Permanent deletion refuses a folder that still has
    /// children rather than cascading, because a cascade behind a single request is how a
    /// subtree disappears by accident; the caller empties the folder first, or the trash
    /// keeps it recoverable.
    /// </remarks>
    public class FolderManagementService : IFolderManagementService
    {
        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessResolver _resolver;
        private readonly IContentAccessRepository _accessRepository;

        public FolderManagementService(
            IDbContextProvider dbContextProvider,
            IContentAccessResolver resolver,
            IContentAccessRepository accessRepository)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
            _accessRepository = accessRepository;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<Directory> Directories => _dbContextProvider.GetCollection<Directory>("Directories");
        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");

        public async Task<FolderOperationResult> CreateFolderAsync(
            string name,
            string? parentFolderId,
            string? description = null,
            string? configurationName = null,
            string? moduleName = null,
            string[]? allowedFileExtensions = null,
            CancellationToken cancellationToken = default)
        {
            var systemName = ToSystemName(name);
            Directory? parent = null;

            if (!string.IsNullOrWhiteSpace(parentFolderId))
            {
                parent = await LoadFolderAsync(parentFolderId!, cancellationToken);
                if (parent is null)
                {
                    return FolderOperationResult.Failure(FolderOperationStatus.ParentNotFound);
                }

                if (!await _resolver.ResolveAsync(Describe(parent), ContentPermission.Edit, cancellationToken))
                {
                    await AuditAsync(parent.ItemId, ContentResourceType.Folder, "Edit", false,
                        $"create folder '{name}' refused", cancellationToken);
                    return FolderOperationResult.Failure(FolderOperationStatus.NotPermitted);
                }
            }

            if (await SiblingNameTakenAsync(parentFolderId, systemName, null, cancellationToken))
            {
                return FolderOperationResult.Failure(FolderOperationStatus.NameConflict);
            }

            var ancestorIds = parent is null
                ? new List<string>()
                : new List<string>(parent.AncestorIds) { parent.ItemId };

            var folder = Directory.CreateNew(new DirectoryOptions
            {
                ItemId = Guid.NewGuid().ToString(),
                Name = name,
                ParentDirectoryId = parentFolderId ?? string.Empty,
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
            folder.SystemName = systemName;

            await Directories.InsertOneAsync(folder, cancellationToken: cancellationToken);

            if (parent is not null)
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, parent.ItemId),
                    Builders<Directory>.Update.Inc(d => d.ChildFolderCount, 1),
                    cancellationToken: cancellationToken);
            }

            await AuditAsync(folder.ItemId, ContentResourceType.Folder, "Edit", true, "folder created", cancellationToken);

            return FolderOperationResult.Success(folder.ItemId, folder);
        }

        public async Task<FolderOperationResult> GetFolderAsync(string folderId, CancellationToken cancellationToken = default)
        {
            var folder = await LoadFolderAsync(folderId, cancellationToken);
            if (folder is null)
            {
                return FolderOperationResult.Failure(FolderOperationStatus.NotFound);
            }

            var flags = await _resolver.ResolveFlagsAsync(Describe(folder), cancellationToken);
            if (!flags.CanView)
            {
                // Refused reads report NotFound rather than NotPermitted, so a caller cannot
                // use this endpoint to discover that a folder exists.
                await AuditAsync(folderId, ContentResourceType.Folder, "View", false, null, cancellationToken);
                return FolderOperationResult.Failure(FolderOperationStatus.NotFound);
            }

            return FolderOperationResult.Success(folder.ItemId, folder, flags);
        }

        public async Task<FolderOperationResult> UpdateFolderAsync(
            string folderId, string? name, string? description, CancellationToken cancellationToken = default)
        {
            var folder = await LoadFolderAsync(folderId, cancellationToken);
            if (folder is null)
            {
                return FolderOperationResult.Failure(FolderOperationStatus.NotFound);
            }

            if (!await _resolver.ResolveAsync(Describe(folder), ContentPermission.Edit, cancellationToken))
            {
                await AuditAsync(folderId, ContentResourceType.Folder, "Edit", false, null, cancellationToken);
                return FolderOperationResult.Failure(FolderOperationStatus.NotPermitted);
            }

            var updates = new List<UpdateDefinition<Directory>>();
            var renamed = !string.IsNullOrWhiteSpace(name) && !string.Equals(name, folder.Name, StringComparison.Ordinal);

            if (renamed)
            {
                var systemName = ToSystemName(name!);
                if (await SiblingNameTakenAsync(folder.ParentDirectoryID, systemName, folder.ItemId, cancellationToken))
                {
                    return FolderOperationResult.Failure(FolderOperationStatus.NameConflict);
                }

                updates.Add(Builders<Directory>.Update.Set(d => d.Name, name));
                updates.Add(Builders<Directory>.Update.Set(d => d.SystemName, systemName));
                updates.Add(Builders<Directory>.Update.Set(d => d.FullPath, RenameLeaf(folder.FullPath, name!)));
            }

            if (description is not null)
            {
                updates.Add(Builders<Directory>.Update.Set(d => d.Description, description));
            }

            if (updates.Count == 0)
            {
                return FolderOperationResult.Success(folder.ItemId, folder);
            }

            updates.Add(Builders<Directory>.Update.Set(d => d.LastUpdatedBy, UserId));
            updates.Add(Builders<Directory>.Update.Set(d => d.LastUpdatedDate, DateTime.UtcNow));

            await Directories.UpdateOneAsync(
                Builders<Directory>.Filter.Eq(d => d.ItemId, folder.ItemId),
                Builders<Directory>.Update.Combine(updates),
                cancellationToken: cancellationToken);

            await AuditAsync(folderId, ContentResourceType.Folder, "Edit", true,
                renamed ? $"renamed to '{name}'" : "metadata updated", cancellationToken);

            // A rename changes the stored path of every descendant. Callers that care about
            // descendant paths run the hierarchy rebuild; it is not done inline because a
            // rename near the root would turn one request into an unbounded write.
            return FolderOperationResult.Success(folder.ItemId, folder);
        }

        public async Task<FolderOperationResult> DeleteFolderAsync(
            string folderId, bool permanent = false, CancellationToken cancellationToken = default)
        {
            var folder = await LoadFolderAsync(folderId, cancellationToken, includeArchived: true);
            if (folder is null)
            {
                return FolderOperationResult.Failure(FolderOperationStatus.NotFound);
            }

            if (!await _resolver.ResolveAsync(Describe(folder), ContentPermission.Delete, cancellationToken))
            {
                await AuditAsync(folderId, ContentResourceType.Folder, "Delete", false, null, cancellationToken);
                return FolderOperationResult.Failure(FolderOperationStatus.NotPermitted);
            }

            if (permanent)
            {
                if (await HasChildrenAsync(folderId, cancellationToken))
                {
                    return FolderOperationResult.Failure(FolderOperationStatus.NotEmpty);
                }

                await Directories.DeleteOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, folderId), cancellationToken);
                await _accessRepository.RevokeAllForResourceAsync(folderId, cancellationToken);
                await AuditAsync(folderId, ContentResourceType.Folder, "Delete", true, "permanent", cancellationToken);
            }
            else
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, folderId),
                    Builders<Directory>.Update
                        .Set(d => d.IsArchived, true)
                        .Set(d => d.LastUpdatedBy, UserId)
                        .Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                    cancellationToken: cancellationToken);
                await AuditAsync(folderId, ContentResourceType.Folder, "Delete", true, "trashed", cancellationToken);
            }

            if (!string.IsNullOrWhiteSpace(folder.ParentDirectoryID))
            {
                await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.ItemId, folder.ParentDirectoryID),
                    Builders<Directory>.Update.Inc(d => d.ChildFolderCount, -1),
                    cancellationToken: cancellationToken);
            }

            return FolderOperationResult.Success(folderId);
        }

        private async Task<Directory?> LoadFolderAsync(
            string folderId, CancellationToken cancellationToken, bool includeArchived = false)
        {
            var filter = Builders<Directory>.Filter.Eq(d => d.ItemId, folderId);

            if (!includeArchived)
            {
                filter &= Builders<Directory>.Filter.Eq(d => d.IsArchived, false);
            }

            return await (await Directories.FindAsync(filter, cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);
        }

        private async Task<bool> SiblingNameTakenAsync(
            string? parentFolderId, string systemName, string? excludingItemId, CancellationToken cancellationToken)
        {
            // Directory.CreateNew stores a root folder's parent as null, not "". Comparing
            // against "" here would mean no root folder ever matched another, so duplicate
            // root names would all be accepted.
            var parentFilter = string.IsNullOrWhiteSpace(parentFolderId)
                ? Builders<Directory>.Filter.Eq(d => d.ParentDirectoryID, null)
                : Builders<Directory>.Filter.Eq(d => d.ParentDirectoryID, parentFolderId);

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

        private async Task<bool> HasChildrenAsync(string folderId, CancellationToken cancellationToken)
        {
            var folders = await Directories.CountDocumentsAsync(
                Builders<Directory>.Filter.And(
                    Builders<Directory>.Filter.Eq(d => d.ParentDirectoryID, folderId)),
                cancellationToken: cancellationToken);

            if (folders > 0)
            {
                return true;
            }

            return await Files.CountDocumentsAsync(
                Builders<File>.Filter.Eq(f => f.ParentDirectoryID, folderId),
                cancellationToken: cancellationToken) > 0;
        }

        private static ContentResourceDescriptor Describe(Directory folder) => new()
        {
            ResourceId = folder.ItemId,
            AncestorIds = folder.AncestorIds ?? new List<string>(),
            InheritsParentAccess = folder.InheritsParentAccess,
            CreatedBy = folder.CreatedBy,
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
