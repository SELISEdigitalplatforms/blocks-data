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
        /// <summary>A file with the same name already sits in the target folder.</summary>
        NameConflict = 3,
        /// <summary>The target folder does not permit this file's extension.</summary>
        ExtensionNotAllowed = 4,
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

        Task<FileOperationResult> MoveFileAsync(string fileId, string targetFolderId, CancellationToken cancellationToken = default);

        Task<FileOperationResult> CopyFileAsync(string fileId, string targetFolderId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default);
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

        public ContentFileService(IDbContextProvider dbContextProvider, IContentAccessRepository accessRepository)
        {
            _dbContextProvider = dbContextProvider;
            _accessRepository = accessRepository;
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

        public async Task<FileOperationResult> MoveFileAsync(string fileId, string targetFolderId, CancellationToken cancellationToken = default)
        {
            var file = await FindFileAsync(fileId, cancellationToken);
            if (file is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var target = await FindFolderAsync(targetFolderId, cancellationToken);
            if (target is null) return FileOperationResult.Failure(FileOperationStatus.TargetNotFound);

            var rejection = await ValidateTargetAsync(file, target, excludeFileId: fileId, cancellationToken);
            if (rejection is not null) return FileOperationResult.Failure(rejection.Value);

            await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.ItemId, fileId),
                Builders<File>.Update
                    .Set(f => f.ParentDirectoryID, target.ItemId)
                    .Set(f => f.AncestorIds, AncestryOf(target))
                    .Set(f => f.LastUpdatedDate, DateTime.UtcNow)
                    .Set(f => f.LastUpdatedBy, UserId),
                cancellationToken: cancellationToken);

            return new FileOperationResult { Status = FileOperationStatus.Succeeded };
        }

        public async Task<FileOperationResult> CopyFileAsync(string fileId, string targetFolderId, bool copyAccessPolicies = false, CancellationToken cancellationToken = default)
        {
            var source = await FindFileAsync(fileId, cancellationToken);
            if (source is null) return FileOperationResult.Failure(FileOperationStatus.FileNotFound);

            var target = await FindFolderAsync(targetFolderId, cancellationToken);
            if (target is null) return FileOperationResult.Failure(FileOperationStatus.TargetNotFound);

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
                ParentDirectoryID = target.ItemId,
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
            var clash = b.Eq(f => f.ParentDirectoryID, target.ItemId)
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

        private Task<File> FindFileAsync(string fileId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(fileId)
                ? Task.FromResult<File>(null!)
                : Files.Find(Builders<File>.Filter.Eq(f => f.ItemId, fileId)).FirstOrDefaultAsync(cancellationToken);

        private Task<Directory> FindFolderAsync(string folderId, CancellationToken cancellationToken) =>
            string.IsNullOrEmpty(folderId)
                ? Task.FromResult<Directory>(null!)
                : Directories
                    .Find(Builders<Directory>.Filter.Eq(d => d.ItemId, folderId))
                    .FirstOrDefaultAsync(cancellationToken);
    }
}
