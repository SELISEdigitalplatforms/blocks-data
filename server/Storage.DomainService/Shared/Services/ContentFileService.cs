using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public enum FileOperationStatus
    {
        Succeeded = 0,
        FileNotFound = 1,
        TargetNotFound = 2,
        /// <summary>A file with the same name already sits in the target directory.</summary>
        NameConflict = 3,
        /// <summary>The target directory does not permit this file's extension.</summary>
        ExtensionNotAllowed = 4,
        NotPermitted = 5,
    }

    public sealed class FileOperationResult
    {
        public FileOperationStatus Status { get; init; }
        /// <summary>Set only when a copy succeeded: the item id of the new file.</summary>
        public string? NewFileId { get; init; }

        public static FileOperationResult Failure(FileOperationStatus status) => new() { Status = status };
    }

    public sealed class FileVersionPage
    {
        public List<FileVersion> Items { get; set; } = new();
        /// <summary>Null when there are no older versions left.</summary>
        public string? NextCursor { get; set; }
        public bool HasMore { get; set; }
    }

    public interface IContentFileService
    {
        /// <summary>Versions of a file, newest first.</summary>
        Task<FileVersionPage> GetVersionsAsync(string fileId, string? cursor = null, int limit = 25, CancellationToken cancellationToken = default);

        Task<FileOperationResult> MoveFileAsync(string fileId, string targetDirectoryId, CancellationToken cancellationToken = default);

        Task<FileOperationResult> CopyFileAsync(string fileId, string targetDirectoryId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// File-level operations that sit above the storage provider: version history, move,
    /// and copy.
    /// </summary>
    public class ContentFileService : IContentFileService
    {
        internal const int MaxVersionPageSize = 100;

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessRepository _accessRepository;
        private readonly IContentAccessResolver? _resolver;

        public ContentFileService(IDbContextProvider dbContextProvider, IContentAccessRepository accessRepository,
            IContentAccessResolver? resolver = null)
        {
            _dbContextProvider = dbContextProvider;
            _accessRepository = accessRepository;
            _resolver = resolver;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");
        private IMongoCollection<Directory> Directories => _dbContextProvider.GetCollection<Directory>("Directories");
        private IMongoCollection<FileVersion> Versions => _dbContextProvider.GetCollection<FileVersion>("FileVersions");

        public async Task<FileVersionPage> GetVersionsAsync(string fileId, string? cursor = null, int limit = 25, CancellationToken cancellationToken = default)
        {
            var page = new FileVersionPage();
            if (string.IsNullOrEmpty(fileId)) return page;

            var file = await FindFileAsync(fileId, cancellationToken);
            if (file is null || !await AuthorizeAsync(file, ContentPermission.View, "ViewVersions", cancellationToken))
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

            if (!await AuthorizeAsync(file, ContentPermission.Delete, "Move", cancellationToken)
                || !await AuthorizeAsync(target, ContentPermission.Edit, "Move", cancellationToken))
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

            return new FileOperationResult { Status = FileOperationStatus.Succeeded };
        }

        public async Task<FileOperationResult> CopyFileAsync(string fileId, string targetDirectoryId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default)
        {
            var source = await FindFileAsync(fileId, cancellationToken);
            if (source is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var target = await FindDirectoryAsync(targetDirectoryId, cancellationToken);
            if (target is null) return FileOperationResult.Failure(FileOperationStatus.TargetNotFound);

            if (!await AuthorizeAsync(source, ContentPermission.View, "Copy", cancellationToken)
                || !await AuthorizeAsync(target, ContentPermission.Edit, "Copy", cancellationToken))
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
                await _accessRepository.GrantAsync(new ContentAccessPolicy
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
        private async Task<FileOperationStatus?> ValidateTargetAsync(File file, Directory target, string? excludeFileId, CancellationToken cancellationToken)
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

        private static List<string> AncestryOf(Directory target) =>
            (target.AncestorIds ?? new List<string>()).Concat(new[] { target.ItemId }).ToList();

        private async Task RefreshAffectedDirectoryCachesAsync(Directory? source, Directory target,
            CancellationToken cancellationToken)
        {
            var directoryIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var directory in new[] { source, target }.Where(d => d is not null))
            {
                var current = directory!;
                for (var depth = 0; depth < ContentHierarchyService.MaxDepth && current is not null; depth++)
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
            var bDirectory = Builders<Directory>.Filter;
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
                Builders<Directory>.Update
                    .Set(d => d.ChildDirectoryCount, checked((int)childDirectoryCount))
                    .Set(d => d.ChildFileCount, checked((int)childFileCount))
                    .Set(d => d.SizeInBytes, subtreeFiles.Sum(f => f.SizeInBytes)),
                cancellationToken: cancellationToken);
        }

        private Task<File> FindFileAsync(string fileId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(fileId)
                ? Task.FromResult<File>(null!)
                : Files.Find(Builders<File>.Filter.Eq(f => f.ItemId, fileId)).FirstOrDefaultAsync(cancellationToken);

        private Task<Directory> FindDirectoryAsync(string directoryId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(directoryId)
                ? Task.FromResult<Directory>(null!)
                : Directories
                    .Find(Builders<Directory>.Filter.Eq(d => d.ItemId, directoryId))
                    .FirstOrDefaultAsync(cancellationToken);

        private async Task<bool> AuthorizeAsync(File file, ContentPermission permission, string action, CancellationToken cancellationToken) =>
            await AuthorizeAsync(new ContentResourceDescriptor
            {
                ResourceId = file.ItemId, AncestorIds = file.AncestorIds ?? new(),
                InheritsParentAccess = file.InheritsParentAccess, CreatedBy = file.CreatedBy,
            }, ContentResourceType.File, permission, action, cancellationToken);

        private async Task<bool> AuthorizeAsync(Directory directory, ContentPermission permission, string action, CancellationToken cancellationToken) =>
            await AuthorizeAsync(new ContentResourceDescriptor
            {
                ResourceId = directory.ItemId, AncestorIds = directory.AncestorIds ?? new(),
                InheritsParentAccess = directory.InheritsParentAccess, CreatedBy = directory.CreatedBy,
            }, ContentResourceType.Directory, permission, action, cancellationToken);

        private async Task<bool> AuthorizeAsync(ContentResourceDescriptor resource, ContentResourceType type,
            ContentPermission permission, string action, CancellationToken cancellationToken)
        {
            // The resolver is supplied by DI for API operations. Keeping it optional lets
            // hierarchy/data-repair callers use this service without an ambient identity.
            if (_resolver is null) return true;
            var granted = await _resolver.ResolveAsync(resource, permission, cancellationToken);
            await _accessRepository.WriteAuditAsync(new ContentAuditLog
            {
                ItemId = Guid.NewGuid().ToString(), TenantId = TenantId, ResourceId = resource.ResourceId,
                ResourceType = type, UserId = UserId, Action = action, Granted = granted,
                Detail = permission.ToString(), CreatedDate = DateTime.UtcNow, CreatedBy = UserId,
            }, cancellationToken);
            return granted;
        }
    }
}
