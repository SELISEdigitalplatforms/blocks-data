using System.Text.RegularExpressions;
using Blocks.Genesis;
using DomainService.Storage;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>Why a trash operation was refused.</summary>
    public enum TrashOperationStatus
    {
        Succeeded = 0,
        NotFound = 1,
        NotPermitted = 2,
    }

    public sealed class TrashOperationResult
    {
        public TrashOperationStatus Status { get; init; }
        public bool IsSuccess => Status == TrashOperationStatus.Succeeded;

        public static TrashOperationResult Failure(TrashOperationStatus status) => new() { Status = status };
        public static TrashOperationResult Success() => new() { Status = TrashOperationStatus.Succeeded };
    }

    public interface IContentDiscoveryService
    {
        /// <summary>
        /// Name search across directorys and files, restricted to what the caller may view.
        /// Optionally scoped to one subtree.
        /// </summary>
        Task<VisibleChildrenPage> SearchAsync(
            string query,
            string? directoryId = null,
            StructureType? type = null,
            string? cursor = null,
            int limit = 50,
            CancellationToken cancellationToken = default);

        /// <summary>Archived directorys and files the caller may view.</summary>
        Task<VisibleChildrenPage> GetTrashAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Live content explicitly shared with the calling user, one of their roles, or
        /// their active organization. Public content and content merely owned by the caller
        /// are deliberately excluded.
        /// </summary>
        Task<VisibleChildrenPage> GetSharedAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default);

        Task<TrashOperationResult> RestoreAsync(string resourceId, CancellationToken cancellationToken = default);

        Task<TrashOperationResult> DeleteFromTrashAsync(string resourceId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Finding content: search by name, and the trash.
    /// </summary>
    /// <remarks>
    /// Split out from <c>ContentManagementService</c>, which the specification groups this
    /// with, for the same reason the listing and hierarchy services were split: that class
    /// is about who may do what, and these are reads over the content collections. The
    /// behaviour is the specified behaviour; only the file boundary differs.
    ///
    /// Search is a case-insensitive substring match, and the user's text is escaped before
    /// it reaches the regex so a query containing regex metacharacters is matched
    /// literally rather than running as a pattern. Full-text search is Phase 2.
    ///
    /// Both reads filter through the access resolver, so a match the caller may not view
    /// never reaches them. Pages are assembled after filtering, which means a page can
    /// come back shorter than the limit while more results remain; callers follow
    /// <c>NextCursor</c> rather than assuming a full page means more.
    /// </remarks>
    public class ContentDiscoveryService : IContentDiscoveryService
    {
        /// <summary>
        /// Upper bound on candidates examined per request. Search and trash both scan
        /// before filtering by access, so without a ceiling a broad query on a large
        /// tenant would walk the whole collection.
        /// </summary>
        internal const int MaxScan = 1000;

        private const string RestoreAuditAction = "Restore";
        private const string DeleteAuditAction = "Delete";

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessResolver _resolver;
        private readonly IContentAccessRepository _accessRepository;
        private readonly IFileManagementService _fileManagementService;
        private readonly IFileDirectoryManagementService _fileDirectoryManagementService;

        public ContentDiscoveryService(
            IDbContextProvider dbContextProvider,
            IContentAccessResolver resolver,
            IContentAccessRepository accessRepository,
            IFileManagementService fileManagementService,
            IFileDirectoryManagementService fileDirectoryManagementService)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
            _accessRepository = accessRepository;
            _fileManagementService = fileManagementService;
            _fileDirectoryManagementService = fileDirectoryManagementService;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<FileDirectory> Directories => _dbContextProvider.GetCollection<FileDirectory>("FileDirectories");
        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");

        public Task<VisibleChildrenPage> SearchAsync(
            string query,
            string? directoryId = null,
            StructureType? type = null,
            string? cursor = null,
            int limit = 50,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Task.FromResult(new VisibleChildrenPage());
            }

            // Escaped so a query like "report(1)" is matched as text rather than compiled
            // as a group, and so a pathological pattern cannot be supplied by a caller.
            var pattern = new BsonRegularExpression(Regex.Escape(query.Trim()), "i");

            var directoryFilter = Builders<FileDirectory>.Filter.And(
                Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, false),
                Builders<FileDirectory>.Filter.Regex(d => d.Name, pattern));

            var fileFilter = Builders<File>.Filter.And(
                Builders<File>.Filter.Eq(f => f.IsArchived, false),
                Builders<File>.Filter.Regex(f => f.Name, pattern));

            if (!string.IsNullOrWhiteSpace(directoryId))
            {
                // AncestorIds holds the whole chain, so this scopes to the subtree without
                // a recursive walk. The directory itself is not a result of its own search.
                directoryFilter &= Builders<FileDirectory>.Filter.AnyEq(d => d.AncestorIds, directoryId);
                fileFilter &= Builders<File>.Filter.AnyEq(f => f.AncestorIds, directoryId);
            }

            return AssemblePageAsync(directoryFilter, fileFilter, type, cursor, limit, cancellationToken);
        }

        public Task<VisibleChildrenPage> GetTrashAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default)
        {
            var directoryFilter = Builders<FileDirectory>.Filter.And(
                Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, true));

            var fileFilter = Builders<File>.Filter.And(
                Builders<File>.Filter.Eq(f => f.IsArchived, true));

            return AssemblePageAsync(directoryFilter, fileFilter, type, cursor, limit, cancellationToken);
        }

        public Task<VisibleChildrenPage> GetSharedAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default)
        {
            var directoryFilter = Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, false);
            var fileFilter = Builders<File>.Filter.Eq(f => f.IsArchived, false);

            return AssemblePageAsync(directoryFilter, fileFilter, type, cursor, limit, cancellationToken, sharedOnly: true);
        }

        public async Task<TrashOperationResult> RestoreAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var directory = await FindArchivedDirectoryAsync(resourceId, cancellationToken);
            if (directory is not null)
            {
                var restore = await _fileDirectoryManagementService.RestoreDirectoryAsync(resourceId, cancellationToken);
                return restore.Status switch
                {
                    DirectoryOperationStatus.Succeeded => TrashOperationResult.Success(),
                    DirectoryOperationStatus.NotPermitted => TrashOperationResult.Failure(TrashOperationStatus.NotPermitted),
                    _ => TrashOperationResult.Failure(TrashOperationStatus.NotFound),
                };
            }

            var file = await FindArchivedFileAsync(resourceId, cancellationToken);
            if (file is null)
            {
                return TrashOperationResult.Failure(TrashOperationStatus.NotFound);
            }

            if (!await _resolver.ResolveAsync(Describe(file), ContentPermission.Delete, cancellationToken))
            {
                await AuditAsync(resourceId, ContentResourceType.File, RestoreAuditAction, false, null, cancellationToken);
                return TrashOperationResult.Failure(TrashOperationStatus.NotPermitted);
            }

            await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.ItemId, resourceId),
                Builders<File>.Update
                    .Set(f => f.IsArchived, false)
                    .Set(f => f.LastUpdatedBy, UserId)
                    .Set(f => f.LastUpdatedDate, DateTime.UtcNow),
                cancellationToken: cancellationToken);

            await AuditAsync(resourceId, ContentResourceType.File, RestoreAuditAction, true, null, cancellationToken);
            return TrashOperationResult.Success();
        }

        public async Task<TrashOperationResult> DeleteFromTrashAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var directory = await FindArchivedDirectoryAsync(resourceId, cancellationToken);
            if (directory is not null)
            {
                var directoryDeletion = await _fileDirectoryManagementService.DeleteDirectoryAsync(
                    resourceId, permanent: true, cancellationToken: cancellationToken);
                return directoryDeletion.Status switch
                {
                    DirectoryOperationStatus.Succeeded => TrashOperationResult.Success(),
                    DirectoryOperationStatus.NotPermitted => TrashOperationResult.Failure(TrashOperationStatus.NotPermitted),
                    _ => TrashOperationResult.Failure(TrashOperationStatus.NotFound),
                };
            }

            var file = await FindArchivedFileAsync(resourceId, cancellationToken);
            if (file is null)
            {
                return TrashOperationResult.Failure(TrashOperationStatus.NotFound);
            }

            if (!await _resolver.ResolveAsync(Describe(file), ContentPermission.Delete, cancellationToken))
            {
                await AuditAsync(resourceId, ContentResourceType.File, DeleteAuditAction, false, "permanent refused", cancellationToken);
                return TrashOperationResult.Failure(TrashOperationStatus.NotPermitted);
            }

            var deletion = await _fileManagementService.DeleteFileAsync(new DeleteFileRequest
            {
                FileId = file.ItemId,
                ConfigurationName = file.ConfigurationName,
                Permanent = true,
            });
            if (!deletion.IsSuccess)
            {
                return TrashOperationResult.Failure(TrashOperationStatus.NotFound);
            }

            await AuditAsync(resourceId, ContentResourceType.File, DeleteAuditAction, true, "permanent", cancellationToken);
            return TrashOperationResult.Success();
        }

        /// <summary>
        /// Runs both collection queries, merges them on the shared sort key, filters by
        /// access and cuts a page. Shared by search and trash because the two differ only
        /// in their filters.
        /// </summary>
        private async Task<VisibleChildrenPage> AssemblePageAsync(
            FilterDefinition<FileDirectory> directoryFilter,
            FilterDefinition<File> fileFilter,
            StructureType? type,
            string? cursor,
            int limit,
            CancellationToken cancellationToken,
            bool sharedOnly = false)
        {
            if (limit < 1) limit = 1;
            if (limit > 200) limit = 200;

            var candidates = new List<VisibleChildItem>();

            if (type != StructureType.File)
            {
                var directorys = await (await Directories.FindAsync(
                        directoryFilter,
                        new FindOptions<FileDirectory> { Limit = MaxScan, Sort = Builders<FileDirectory>.Sort.Ascending(d => d.Name) },
                        cancellationToken))
                    .ToListAsync(cancellationToken);

                candidates.AddRange(directorys.Select(f => new VisibleChildItem
                {
                    ItemId = f.ItemId,
                    Name = f.Name ?? string.Empty,
                    Type = StructureType.Directory,
                    ParentDirectoryId = f.ParentId,
                    SizeInBytes = f.SizeInBytes,
                    CreatedDate = f.CreatedDate,
                    LastUpdatedDate = f.LastUpdatedDate,
                    CreatedBy = f.CreatedBy,
                    IsDefault = f.Tags != null && f.Tags.Contains("default", StringComparer.OrdinalIgnoreCase),
                }));
            }

            if (type != StructureType.Directory)
            {
                var files = await (await Files.FindAsync(
                        fileFilter,
                        new FindOptions<File> { Limit = MaxScan, Sort = Builders<File>.Sort.Ascending(f => f.Name) },
                        cancellationToken))
                    .ToListAsync(cancellationToken);

                candidates.AddRange(files.Select(f => new VisibleChildItem
                {
                    ItemId = f.ItemId,
                    Name = f.Name ?? string.Empty,
                    Type = StructureType.File,
                    ParentDirectoryId = f.DirectoryId,
                    SizeInBytes = f.SizeInBytes,
                    Extension = f.Extension,
                    ContentType = f.ContentType,
                    CreatedDate = f.CreatedDate,
                    LastUpdatedDate = f.LastUpdatedDate,
                    CreatedBy = f.CreatedBy,
                }));
            }

            candidates.Sort((a, b) => ContentCursor.Compare(a.Type, a.Name, a.ItemId, b.Type, b.Name, b.ItemId));

            // This view is an inbox of content someone else shared with the caller. A
            // creator's own resources belong in their normal directory/search results,
            // even if an access entry also happens to match them.
            if (sharedOnly)
            {
                candidates = candidates
                    .Where(c => !string.Equals(c.CreatedBy, UserId, StringComparison.Ordinal))
                    .ToList();
            }

            var start = ContentCursor.Decode(cursor);
            if (start is not null)
            {
                candidates = candidates
                    .Where(c => ContentCursor.Compare(c.Type, c.Name, c.ItemId, start.Type, start.Name, start.ItemId) > 0)
                    .ToList();
            }

            var descriptors = (await BuildDescriptorsAsync(candidates, cancellationToken))
                .ToDictionary(d => d.ResourceId, StringComparer.Ordinal);
            var sharedPolicyResourceIds = sharedOnly
                ? await GetMatchingShareResourceIdsAsync(descriptors.Values, cancellationToken)
                : null;

            // Full resolution per candidate, not FilterVisibleAsync. That method implements
            // the listing shortcut, which treats a purely inheriting resource as visible
            // because its parent already was. Search and trash have no such parent: they
            // reach across the whole tenant, so an item inheriting from an ancestor the
            // caller cannot see would be admitted by the shortcut. Resolving View outright
            // is the only correct answer here.
            var visible = new List<VisibleChildItem>();
            foreach (var candidate in candidates)
            {
                if (!descriptors.TryGetValue(candidate.ItemId, out var descriptor))
                {
                    continue;
                }

                if (sharedOnly && !HasMatchingShare(descriptor, sharedPolicyResourceIds!))
                {
                    continue;
                }

                var flags = await _resolver.ResolveFlagsAsync(descriptor, cancellationToken);
                if (!flags.CanView)
                {
                    continue;
                }

                candidate.Permissions = flags;
                visible.Add(candidate);

                // Stop once a full page plus its lookahead is confirmed, so a broad query
                // does not resolve every candidate it scanned.
                if (visible.Count > limit)
                {
                    break;
                }
            }

            var page = visible.Take(limit).ToList();
            var hasMore = visible.Count > limit;

            var last = page.LastOrDefault();

            return new VisibleChildrenPage
            {
                Items = page,
                HasMore = hasMore,
                NextCursor = hasMore && last is not null
                    ? new ContentCursor { Type = last.Type, Name = last.Name, ItemId = last.ItemId }.Encode()
                    : null,
                TotalChildCount = page.Count,
            };
        }

        private async Task<HashSet<string>> GetMatchingShareResourceIdsAsync(
            IEnumerable<ContentResourceDescriptor> descriptors, CancellationToken cancellationToken)
        {
            var descriptorList = descriptors.ToList();
            var resourceIds = descriptorList
                .SelectMany(RelevantResourceIds)
                .Distinct(StringComparer.Ordinal);
            var policies = await _accessRepository.GetByResourcesAsync(resourceIds, cancellationToken);
            var context = BlocksContext.GetContext();

            return policies
                .Where(p => p.Effect == ContentEffect.Allow)
                .Where(p => p.Permission >= ContentPermission.View)
                .Where(p => MatchesSharePrincipal(p, context))
                .Select(p => p.ResourceId)
                .ToHashSet(StringComparer.Ordinal);
        }

        private static bool HasMatchingShare(
            ContentResourceDescriptor descriptor, IReadOnlySet<string> sharedPolicyResourceIds) =>
            RelevantResourceIds(descriptor).Any(sharedPolicyResourceIds.Contains);

        private static IEnumerable<string> RelevantResourceIds(ContentResourceDescriptor descriptor)
        {
            yield return descriptor.ResourceId;

            if (!descriptor.InheritsParentAccess) yield break;

            for (var i = descriptor.AncestorIds.Count - 1; i >= 0; i--)
            {
                yield return descriptor.AncestorIds[i];
            }
        }

        private static bool MatchesSharePrincipal(ContentAccessPolicy policy, BlocksContext? context) => policy.PrincipalType switch
        {
            ContentPrincipalType.User => !string.IsNullOrEmpty(policy.PrincipalId)
                                        && string.Equals(policy.PrincipalId, context?.UserId, StringComparison.Ordinal),
            ContentPrincipalType.Role => !string.IsNullOrEmpty(policy.PrincipalId)
                                        && context?.Roles is not null
                                        && context.Roles.Contains(policy.PrincipalId, StringComparer.Ordinal),
            ContentPrincipalType.Organization => !string.IsNullOrEmpty(policy.PrincipalId)
                                                && !string.IsNullOrEmpty(context?.OrganizationId)
                                                && string.Equals(policy.PrincipalId, context.OrganizationId, StringComparison.Ordinal),
            _ => false,
        };

        /// <summary>
        /// Loads the ancestry and inheritance flags the resolver needs, in two queries
        /// rather than one per candidate.
        /// </summary>
        private async Task<List<ContentResourceDescriptor>> BuildDescriptorsAsync(
            List<VisibleChildItem> candidates, CancellationToken cancellationToken)
        {
            var descriptors = new List<ContentResourceDescriptor>(candidates.Count);

            var directoryIds = candidates.Where(c => c.Type == StructureType.Directory).Select(c => c.ItemId).ToList();
            var fileIds = candidates.Where(c => c.Type == StructureType.File).Select(c => c.ItemId).ToList();

            if (directoryIds.Count > 0)
            {
                var directorys = await (await Directories.FindAsync(
                        Builders<FileDirectory>.Filter.In(d => d.ItemId, directoryIds),
                        cancellationToken: cancellationToken))
                    .ToListAsync(cancellationToken);

                descriptors.AddRange(directorys.Select(Describe));
            }

            if (fileIds.Count > 0)
            {
                var files = await (await Files.FindAsync(
                        Builders<File>.Filter.In(f => f.ItemId, fileIds),
                        cancellationToken: cancellationToken))
                    .ToListAsync(cancellationToken);

                descriptors.AddRange(files.Select(Describe));
            }

            return descriptors;
        }

        private async Task<FileDirectory?> FindArchivedDirectoryAsync(string resourceId, CancellationToken cancellationToken) =>
            await (await Directories.FindAsync(
                    Builders<FileDirectory>.Filter.And(
                        Builders<FileDirectory>.Filter.Eq(d => d.ItemId, resourceId),
                        Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, true)),
                    cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);

        private async Task<File?> FindArchivedFileAsync(string resourceId, CancellationToken cancellationToken) =>
            await (await Files.FindAsync(
                    Builders<File>.Filter.And(
                        Builders<File>.Filter.Eq(f => f.ItemId, resourceId),
                        Builders<File>.Filter.Eq(f => f.IsArchived, true)),
                    cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);

        private static ContentResourceDescriptor Describe(FileDirectory directory) => new()
        {
            ResourceId = directory.ItemId,
            AncestorIds = directory.AncestorIds ?? new List<string>(),
            InheritsParentAccess = directory.InheritsParentAccess,
            CreatedBy = directory.CreatedBy,
        };

        private static ContentResourceDescriptor Describe(File file) => new()
        {
            ResourceId = file.ItemId,
            AncestorIds = file.AncestorIds ?? new List<string>(),
            InheritsParentAccess = file.InheritsParentAccess,
            CreatedBy = file.CreatedBy,
        };

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
