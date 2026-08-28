using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// File-level operations that sit above the storage provider: version history, move,
    /// and copy.
    /// </summary>
    public class FileService : IFileService
    {
        internal const int MaxVersionPageSize = 100;

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IObjectAccessRepository _accessRepository;
        private readonly IObjectAccessResolver? _resolver;
        private readonly IObjectItemWriter? _objectItems;

        public FileService(IDbContextProvider dbContextProvider, IObjectAccessRepository accessRepository,
            IObjectAccessResolver? resolver = null, IObjectItemWriter? objectItems = null)
        {
            _dbContextProvider = dbContextProvider;
            _accessRepository = accessRepository;
            _resolver = resolver;
            _objectItems = objectItems;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");
        private IMongoCollection<FileDirectory> Directories => _dbContextProvider.GetCollection<FileDirectory>("FileDirectories");
        private IMongoCollection<FileVersion> Versions => _dbContextProvider.GetCollection<FileVersion>("FileVersions");

        public async Task<FileVersionPage> GetVersionsAsync(string fileId, string? cursor = null, int limit = 25, CancellationToken cancellationToken = default)
        {
            var page = new FileVersionPage();
            if (string.IsNullOrEmpty(fileId)) return page;

            var file = await FindFileAsync(fileId, cancellationToken);
            if (file is null || !await AuthorizeAsync(file, ObjectPermission.View, "ViewVersions", cancellationToken))
                return page;

            limit = Math.Clamp(limit, 1, MaxVersionPageSize);

            var b = Builders<FileVersion>.Filter;
            var filter = b.Eq(v => v.FileId, fileId);

            // Newest first, so the cursor walks downwards through version numbers.
            if (long.TryParse(cursor, out var after))
            {
                filter &= b.Lt(v => v.No, after);
            }

            var rows = await Versions.Find(filter)
                .SortByDescending(v => v.No)
                .Limit(limit + 1)
                .ToListAsync(cancellationToken);

            page.HasMore = rows.Count > limit;
            if (page.HasMore) rows.RemoveAt(rows.Count - 1);

            page.Items = rows;
            if (page.HasMore && rows.Count > 0)
            {
                page.NextCursor = rows[^1].No.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }

            return page;
        }

        public async Task<FileOperationResult> MoveFileAsync(string fileId, string targetDirectoryId, CancellationToken cancellationToken = default)
        {
            var file = await FindFileAsync(fileId, cancellationToken);
            if (file is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var source = await FindDirectoryAsync(file.DirectoryId ?? string.Empty, cancellationToken);

            var target = await FindDirectoryAsync(targetDirectoryId, cancellationToken);
            if (target is null) return FileOperationResult.Failure(FileOperationStatus.TargetNotFound);

            if (!await AuthorizeAsync(file, ObjectPermission.Delete, "Move", cancellationToken)
                || !await AuthorizeAsync(target, ObjectPermission.Edit, "Move", cancellationToken))
                return FileOperationResult.Failure(FileOperationStatus.NotPermitted);

            var rejection = await ValidateTargetAsync(file, target, excludeFileId: fileId, cancellationToken);
            if (rejection is not null) return FileOperationResult.Failure(rejection.Value);

            await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.ItemId, fileId),
                Builders<File>.Update
                    .Set(f => f.DirectoryId, target.ItemId)
                    .Set(f => f.AncestorIds, AncestryOf(target))
                    .Set(f => f.LastUpdatedDate, DateTime.UtcNow)
                    .Set(f => f.LastUpdatedBy, UserId),
                cancellationToken: cancellationToken);

            await RefreshAffectedDirectoryCachesAsync(source, target, cancellationToken);
            if (_objectItems is not null)
            {
                file.DirectoryId = target.ItemId;
                file.AncestorIds = AncestryOf(target);
                file.LastUpdatedDate = DateTime.UtcNow;
                await _objectItems.UpsertAsync(file, cancellationToken);
            }

            return new FileOperationResult { Status = FileOperationStatus.Succeeded };
        }

        public async Task<FileOperationResult> RenameFileAsync(string fileId, string name, CancellationToken cancellationToken = default)
        {
            var file = await FindFileAsync(fileId, cancellationToken);
            if (file is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var trimmedName = name?.Trim();
            if (string.IsNullOrEmpty(trimmedName)) return FileOperationResult.Failure(FileOperationStatus.InvalidName);

            if (!await AuthorizeAsync(file, ObjectPermission.Edit, "Rename", cancellationToken))
                return FileOperationResult.Failure(FileOperationStatus.NotPermitted);

            var systemName = trimmedName.ToLowerInvariant();
            var b = Builders<File>.Filter;
            var clash = b.Eq(f => f.DirectoryId, file.DirectoryId)
                        & b.Eq(f => f.SystemName, systemName)
                        & b.Eq(f => f.IsArchived, false)
                        & b.Ne(f => f.ItemId, file.ItemId);

            if (await Files.Find(clash).AnyAsync(cancellationToken))
                return FileOperationResult.Failure(FileOperationStatus.NameConflict);

            var latestVersion = await Versions
                .Find(Builders<FileVersion>.Filter.Eq(v => v.FileId, file.ItemId))
                .SortByDescending(v => v.No)
                .FirstOrDefaultAsync(cancellationToken);

            var updatedFile = await Files.FindOneAndUpdateAsync(
                b.Eq(f => f.ItemId, fileId),
                Builders<File>.Update
                    .Set(f => f.Name, trimmedName)
                    .Set(f => f.SystemName, systemName)
                    .Set(f => f.Extension, Path.GetExtension(trimmedName).TrimStart('.'))
                    .Set(f => f.LastUpdatedDate, DateTime.UtcNow)
                    .Set(f => f.LastUpdatedBy, UserId)
                    .Inc(f => f.CurrentVersion, 1L),
                new FindOneAndUpdateOptions<File> { ReturnDocument = ReturnDocument.After },
                cancellationToken);

            await CreateRenameVersionAsync(file.ItemId, updatedFile.CurrentVersion, latestVersion, cancellationToken);

            if (_objectItems is not null)
            {
                file.Name = trimmedName;
                file.Extension = Path.GetExtension(trimmedName).TrimStart('.');
                file.LastUpdatedDate = DateTime.UtcNow;
                await _objectItems.UpsertAsync(file, cancellationToken);
            }

            return new FileOperationResult { Status = FileOperationStatus.Succeeded };
        }

        /// <summary>
        /// A rename doesn't change bytes, so the new version row points at the same object key
        /// as the version it came from — the same no-duplicate-upload approach as
        /// <see cref="CopyVersionsAsync"/>.
        /// </summary>
        private async Task CreateRenameVersionAsync(string fileId, long newVersionNo, FileVersion? latestVersion, CancellationToken cancellationToken)
        {
            var version = FileVersion.CreateNew(fileId, newVersionNo, new FileVersionOptions
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = latestVersion?.TenantId ?? TenantId,
                CreateDate = DateTime.UtcNow,
                CreatedBy = UserId,
                Language = latestVersion?.Language ?? "en",
                Tags = latestVersion?.Tags,
                StorageKey = latestVersion?.StorageKey,
                UploadedBy = UserId,
            });
            version.SizeInBytes = latestVersion?.SizeInBytes ?? 0;

            await Versions.InsertOneAsync(version, cancellationToken: cancellationToken);
        }

        public async Task<FileOperationResult> CopyFileAsync(string fileId, string targetDirectoryId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default)
        {
            var source = await FindFileAsync(fileId, cancellationToken);
            if (source is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var target = await FindDirectoryAsync(targetDirectoryId, cancellationToken);
            if (target is null) return FileOperationResult.Failure(FileOperationStatus.TargetNotFound);

            if (!await AuthorizeAsync(source, ObjectPermission.View, "Copy", cancellationToken)
                || !await AuthorizeAsync(target, ObjectPermission.Edit, "Copy", cancellationToken))
                return FileOperationResult.Failure(FileOperationStatus.NotPermitted);

            var rejection = await ValidateTargetAsync(source, target, excludeFileId: null, cancellationToken);
            if (rejection is not null) return FileOperationResult.Failure(rejection.Value);

            var now = DateTime.UtcNow;
            var copyId = Guid.NewGuid().ToString();

            var copy = new File
            {
                ItemId = copyId,
                TenantId = source.TenantId,
                Name = source.Name,
                SystemName = source.SystemName,
                Url = source.Url,
                AccessModifier = source.AccessModifier,
                MetaData = source.MetaData,
                AdditionalProperties = source.AdditionalProperties,
                DirectoryId = target.ItemId,
                Type = source.Type,
                TypeString = source.TypeString,
                CurrentVersion = source.CurrentVersion,
                AncestorIds = AncestryOf(target),
                // A copy starts inheriting from where it lands, regardless of how the
                // source was configured, so it cannot silently carry a detached policy.
                InheritsParentAccess = true,
                Extension = source.Extension,
                SizeInBytes = source.SizeInBytes,
                ContentType = source.ContentType,
                ConfigurationName = source.ConfigurationName,
                IsActive = true,
                IsArchived = false,
                CreatedDate = now,
                LastUpdatedDate = now,
                CreatedBy = UserId,
                LastUpdatedBy = UserId,
                Language = source.Language,
                Tags = source.Tags,
            };

            await Files.InsertOneAsync(copy, cancellationToken: cancellationToken);
            if (_objectItems is not null) await _objectItems.UpsertAsync(copy, cancellationToken);
            await CopyVersionsAsync(source, copyId, now, cancellationToken);

            if (copyAccessPolicies)
            {
                await CopyAccessPoliciesAsync(source.ItemId, copyId, cancellationToken);
            }

            return new FileOperationResult { Status = FileOperationStatus.Succeeded, NewFileId = copyId };
        }

        /// <summary>
        /// Clones the version rows without duplicating stored bytes: each new row points at
        /// the same object key as the version it came from, which is safe because versions
        /// are immutable.
        /// </summary>
        /// <remarks>
        /// The key embeds the id of the file it was first uploaded against, so a copy's
        /// versions reference storage under the source's prefix. Deleting a file must
        /// therefore not purge its storage objects while another file still references
        /// them, or the copy loses its content.
        /// </remarks>
        private async Task CopyVersionsAsync(File source, string copyId, DateTime now, CancellationToken cancellationToken)
        {
            var b = Builders<FileVersion>.Filter;
            var sourceVersions = await Versions
                .Find(b.Eq(v => v.FileId, source.ItemId))
                .SortBy(v => v.No)
                .ToListAsync(cancellationToken);

            if (sourceVersions.Count == 0) return;

            var clones = sourceVersions.Select(v =>
            {
                var clone = FileVersion.CreateNew(copyId, v.No, new FileVersionOptions
                {
                    ItemId = Guid.NewGuid().ToString(),
                    TenantId = v.TenantId ?? TenantId,
                    CreateDate = now,
                    CreatedBy = UserId,
                    Language = v.Language ?? "en",
                    Tags = v.Tags,
                    StorageKey = v.StorageKey,
                    UploadedBy = v.UploadedBy,
                });
                clone.SizeInBytes = v.SizeInBytes;
                return clone;
            }).ToList();

            await Versions.InsertManyAsync(clones, cancellationToken: cancellationToken);
        }

        private async Task CopyAccessPoliciesAsync(string sourceId, string copyId, CancellationToken cancellationToken)
        {
            var policies = await _accessRepository.GetByResourceAsync(sourceId, cancellationToken);

            foreach (var policy in policies)
            {
                await _accessRepository.GrantAsync(new ObjectAccessPolicy
                {
                    ItemId = Guid.NewGuid().ToString(),
                    TenantId = policy.TenantId,
                    ResourceId = copyId,
                    ResourceType = policy.ResourceType,
                    PrincipalType = policy.PrincipalType,
                    PrincipalId = policy.PrincipalId,
                    Permission = policy.Permission,
                    Effect = policy.Effect,
                    Priority = policy.Priority,
                    ExpiresAt = policy.ExpiresAt,
                    GrantedBy = UserId,
                    CreatedDate = DateTime.UtcNow,
                }, cancellationToken);
            }
        }

        /// <summary>Returns the rejection reason, or null when the target accepts the file.</summary>
        private async Task<FileOperationStatus?> ValidateTargetAsync(File file, FileDirectory target, string? excludeFileId, CancellationToken cancellationToken)
        {
            if (target.AllowedFileExtensions is { Length: > 0 })
            {
                var extension = (file.Extension ?? Path.GetExtension(file.Name ?? string.Empty)).TrimStart('.');
                var permitted = target.AllowedFileExtensions
                    .Any(a => string.Equals(a.TrimStart('.'), extension, StringComparison.OrdinalIgnoreCase));

                if (!permitted) return FileOperationStatus.ExtensionNotAllowed;
            }

            var b = Builders<File>.Filter;
            var clash = b.Eq(f => f.DirectoryId, target.ItemId)
                        & b.Eq(f => f.Name, file.Name)
                        & b.Eq(f => f.IsArchived, false);

            if (!string.IsNullOrEmpty(excludeFileId))
            {
                clash &= b.Ne(f => f.ItemId, excludeFileId);
            }

            return await Files.Find(clash).AnyAsync(cancellationToken)
                ? FileOperationStatus.NameConflict
                : null;
        }

        private static List<string> AncestryOf(FileDirectory target) =>
            (target.AncestorIds ?? new List<string>()).Concat(new[] { target.ItemId }).ToList();

        private async Task RefreshAffectedDirectoryCachesAsync(FileDirectory? source, FileDirectory target,
            CancellationToken cancellationToken)
        {
            var directoryIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var directory in new[] { source, target }.Where(d => d is not null))
            {
                var current = directory!;
                for (var depth = 0; depth < ObjectHierarchyService.MaxDepth && current is not null; depth++)
                {
                    if (!directoryIds.Add(current.ItemId)) break;
                    current = string.IsNullOrEmpty(current.ParentId)
                        ? null
                        : await FindDirectoryAsync(current.ParentId, cancellationToken);
                }
            }

            foreach (var directoryId in directoryIds)
                await RefreshDirectoryCacheAsync(directoryId, cancellationToken);
        }

        private async Task RefreshDirectoryCacheAsync(string directoryId, CancellationToken cancellationToken)
        {
            var bDirectory = Builders<FileDirectory>.Filter;
            var bFile = Builders<File>.Filter;
            var childDirectoryCount = await Directories.CountDocumentsAsync(
                bDirectory.Eq(d => d.ParentId, directoryId) & bDirectory.Eq(d => d.IsArchived, false),
                cancellationToken: cancellationToken);
            var childFileCount = await Files.CountDocumentsAsync(
                bFile.Eq(f => f.DirectoryId, directoryId) & bFile.Eq(f => f.IsArchived, false),
                cancellationToken: cancellationToken);
            var subtreeFiles = await Files.Find(
                    bFile.Eq(f => f.IsArchived, false)
                    & (bFile.AnyEq(f => f.AncestorIds, directoryId) | bFile.Eq(f => f.DirectoryId, directoryId)))
                .ToListAsync(cancellationToken);

            await Directories.UpdateOneAsync(
                bDirectory.Eq(d => d.ItemId, directoryId),
                Builders<FileDirectory>.Update
                    .Set(d => d.ChildDirectoryCount, checked((int)childDirectoryCount))
                    .Set(d => d.ChildFileCount, checked((int)childFileCount))
                    .Set(d => d.SizeInBytes, subtreeFiles.Sum(f => f.SizeInBytes)),
                cancellationToken: cancellationToken);
        }

        private Task<File> FindFileAsync(string fileId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(fileId)
                ? Task.FromResult<File>(null!)
                : Files.Find(Builders<File>.Filter.Eq(f => f.ItemId, fileId)).FirstOrDefaultAsync(cancellationToken);

        private Task<FileDirectory> FindDirectoryAsync(string directoryId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(directoryId)
                ? Task.FromResult<FileDirectory>(null!)
                : Directories
                    .Find(Builders<FileDirectory>.Filter.Eq(d => d.ItemId, directoryId))
                    .FirstOrDefaultAsync(cancellationToken);

        private async Task<bool> AuthorizeAsync(File file, ObjectPermission permission, string action, CancellationToken cancellationToken) =>
            await AuthorizeAsync(new ObjectResourceDescriptor
            {
                ResourceId = file.ItemId,
                AncestorIds = file.AncestorIds ?? new(),
                InheritsParentAccess = file.InheritsParentAccess,
                CreatedBy = file.CreatedBy,
            }, ObjectResourceType.File, permission, action, cancellationToken);

        private async Task<bool> AuthorizeAsync(FileDirectory directory, ObjectPermission permission, string action, CancellationToken cancellationToken) =>
            await AuthorizeAsync(new ObjectResourceDescriptor
            {
                ResourceId = directory.ItemId,
                AncestorIds = directory.AncestorIds ?? new(),
                InheritsParentAccess = directory.InheritsParentAccess,
                CreatedBy = directory.CreatedBy,
            }, ObjectResourceType.Directory, permission, action, cancellationToken);

        private async Task<bool> AuthorizeAsync(ObjectResourceDescriptor resource, ObjectResourceType type,
            ObjectPermission permission, string action, CancellationToken cancellationToken)
        {
            // The resolver is supplied by DI for API operations. Keeping it optional lets
            // hierarchy/data-repair callers use this service without an ambient identity.
            if (_resolver is null) return true;
            var granted = await _resolver.ResolveAsync(resource, permission, cancellationToken);
            await _accessRepository.WriteAuditAsync(new ObjectAuditLog
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = TenantId,
                ResourceId = resource.ResourceId,
                ResourceType = type,
                UserId = UserId,
                Action = action,
                Granted = granted,
                Detail = permission.ToString(),
                CreatedDate = DateTime.UtcNow,
                CreatedBy = UserId,
            }, cancellationToken);
            return granted;
        }
    }
}
