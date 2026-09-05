using Blocks.Genesis;
using DomainService.Storage;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Finding objects: search by name, and the trash.
    /// </summary>
    /// <remarks>
    /// Split out from <c>ObjectManagementService</c>, which the specification groups this
    /// with, for the same reason the listing and hierarchy services were split: that class
    /// is about who may do what, and these are reads over the object collections. The
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
    public class ObjectDiscoveryService : IObjectDiscoveryService
    {
        private const string RestoreAuditAction = "Restore";
        private const string DeleteAuditAction = "Delete";

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IObjectAccessResolver _resolver;
        private readonly IObjectAccessRepository _accessRepository;
        private readonly IFileManagementService _fileManagementService;
        private readonly IFileDirectoryManagementService _fileDirectoryManagementService;
        private readonly IObjectItemRepository? _objectItems;
        private readonly IObjectItemWriter? _objectItemWriter;

        public ObjectDiscoveryService(
            IDbContextProvider dbContextProvider,
            IObjectAccessResolver resolver,
            IObjectAccessRepository accessRepository,
            IFileManagementService fileManagementService,
            IFileDirectoryManagementService fileDirectoryManagementService,
            IObjectItemRepository? objectItems = null,
            IObjectItemWriter? objectItemWriter = null)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
            _accessRepository = accessRepository;
            _fileManagementService = fileManagementService;
            _fileDirectoryManagementService = fileDirectoryManagementService;
            _objectItems = objectItems;
            _objectItemWriter = objectItemWriter;
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

            return AssembleObjectItemPageAsync(null, false, directoryId, type, query, false, cursor, limit, cancellationToken);
        }

        public Task<VisibleChildrenPage> GetObjectAsync(
            string? parentDirectoryId, StructureType? type = null, string? search = null,
            string? cursor = null, int limit = 50, CancellationToken cancellationToken = default) =>
            AssembleObjectItemPageAsync(parentDirectoryId, true, null, type, search, false, cursor, limit, cancellationToken);

        public Task<VisibleChildrenPage> GetTrashAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default)
        {
            return AssembleObjectItemPageAsync(null, false, null, type, null, true, cursor, limit, cancellationToken);
        }

        public Task<VisibleChildrenPage> GetSharedAsync(
            StructureType? type = null, string? cursor = null, int limit = 50,
            CancellationToken cancellationToken = default)
        {
            return AssembleObjectItemPageAsync(null, false, null, type, null, false, cursor, limit, cancellationToken, sharedOnly: true);
        }

        private async Task<VisibleChildrenPage> AssembleObjectItemPageAsync(
            string? parentDirectoryId, bool filterByParent, string? directoryId, StructureType? type, string? search, bool archived,
            string? cursor, int limit, CancellationToken cancellationToken, bool sharedOnly = false)
        {
            if (_objectItems is null)
            {
                throw new InvalidOperationException("ObjectItem repository is required for object discovery.");
            }

            limit = Math.Clamp(limit, 1, 200);
            if (!string.IsNullOrWhiteSpace(parentDirectoryId))
            {
                var parent = await Directories.Find(Builders<FileDirectory>.Filter.Eq(d => d.ItemId, parentDirectoryId)
                    & Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, false)).FirstOrDefaultAsync(cancellationToken);
                if (parent is null || !await _resolver.ResolveAsync(Describe(parent), ObjectPermission.View, cancellationToken))
                    return new VisibleChildrenPage();
            }

            var rows = await _objectItems.FindPageAsync(new ObjectItemQuery
            {
                ParentDirectoryId = parentDirectoryId,
                FilterByParent = filterByParent,
                DirectoryId = directoryId,
                Type = type,
                Search = search,
                IsArchived = archived,
                Cursor = ObjectCursor.Decode(cursor),
                Take = limit + 1,
            }, cancellationToken);

            var descriptors = rows.ToDictionary(i => i.ObjectReferenceId, Describe, StringComparer.Ordinal);
            var sharedIds = sharedOnly
                ? await GetMatchingShareResourceIdsAsync(descriptors.Values, cancellationToken)
                : null;
            var visible = new List<VisibleChildItem>();
            foreach (var row in rows)
            {
                var descriptor = descriptors[row.ObjectReferenceId];
                if (sharedOnly && (string.Equals(row.CreatedBy, UserId, StringComparison.Ordinal)
                    || !HasMatchingShare(descriptor, sharedIds!))) continue;

                var flags = await _resolver.ResolveFlagsAsync(descriptor, cancellationToken);
                if (!flags.CanView) continue;
                visible.Add(ToVisibleItem(row, flags));
                if (visible.Count > limit) break;
            }

            var hasMore = visible.Count > limit || rows.Count > limit;
            if (visible.Count > limit) visible.RemoveAt(visible.Count - 1);
            var last = visible.LastOrDefault();
            return new VisibleChildrenPage
            {
                Items = visible,
                HasMore = hasMore,
                NextCursor = hasMore && last is not null
                    ? new ObjectCursor { Type = last.Type, Name = last.Name, ItemId = last.ItemId }.Encode() : null,
                TotalChildCount = visible.Count,
            };
        }

        private static ObjectResourceDescriptor Describe(ObjectItem item) => new()
        {
            ResourceId = item.ObjectReferenceId,
            AncestorIds = item.AncestorIds ?? new List<string>(),
            InheritsParentAccess = item.InheritsParentAccess,
            CreatedBy = item.CreatedBy,
        };

        private static VisibleChildItem ToVisibleItem(ObjectItem item, ObjectPermissionFlags flags) => new()
        {
            ItemId = item.ObjectReferenceId, Name = item.Name, Type = item.Type,
            ParentDirectoryId = item.ParentDirectoryId, SizeInBytes = item.SizeInBytes,
            Extension = item.Extension, ContentType = item.ContentType,
            CreatedDate = item.CreatedDate, LastUpdatedDate = item.LastUpdatedDate,
            CreatedBy = item.CreatedBy, IsDefault = item.IsDefault, Permissions = flags,
        };

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

            if (!await _resolver.ResolveAsync(Describe(file), ObjectPermission.Delete, cancellationToken))
            {
                await AuditAsync(resourceId, ObjectResourceType.File, RestoreAuditAction, false, null, cancellationToken);
                return TrashOperationResult.Failure(TrashOperationStatus.NotPermitted);
            }

            file.IsArchived = false;
            file.LastUpdatedBy = UserId;
            file.LastUpdatedDate = DateTime.UtcNow;

            await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.ItemId, resourceId),
                Builders<File>.Update
                    .Set(f => f.IsArchived, file.IsArchived)
                    .Set(f => f.LastUpdatedBy, file.LastUpdatedBy)
                    .Set(f => f.LastUpdatedDate, file.LastUpdatedDate),
                cancellationToken: cancellationToken);
            if (_objectItemWriter is not null) await _objectItemWriter.UpsertAsync(file, cancellationToken);

            await AuditAsync(resourceId, ObjectResourceType.File, RestoreAuditAction, true, null, cancellationToken);
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

            if (!await _resolver.ResolveAsync(Describe(file), ObjectPermission.Delete, cancellationToken))
            {
                await AuditAsync(resourceId, ObjectResourceType.File, DeleteAuditAction, false, "permanent refused", cancellationToken);
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

            await AuditAsync(resourceId, ObjectResourceType.File, DeleteAuditAction, true, "permanent", cancellationToken);
            return TrashOperationResult.Success();
        }

        private async Task<HashSet<string>> GetMatchingShareResourceIdsAsync(
            IEnumerable<ObjectResourceDescriptor> descriptors, CancellationToken cancellationToken)
        {
            var descriptorList = descriptors.ToList();
            var resourceIds = descriptorList
                .SelectMany(RelevantResourceIds)
                .Distinct(StringComparer.Ordinal);
            var policies = await _accessRepository.GetByResourcesAsync(resourceIds, cancellationToken);
            var context = BlocksContext.GetContext();

            return policies
                .Where(p => p.Effect == ObjectEffect.Allow)
                .Where(p => p.Permission >= ObjectPermission.View)
                .Where(p => MatchesSharePrincipal(p, context))
                .Select(p => p.ResourceId)
                .ToHashSet(StringComparer.Ordinal);
        }

        private static bool HasMatchingShare(
            ObjectResourceDescriptor descriptor, IReadOnlySet<string> sharedPolicyResourceIds) =>
            RelevantResourceIds(descriptor).Any(sharedPolicyResourceIds.Contains);

        private static IEnumerable<string> RelevantResourceIds(ObjectResourceDescriptor descriptor)
        {
            yield return descriptor.ResourceId;

            if (!descriptor.InheritsParentAccess) yield break;

            for (var i = descriptor.AncestorIds.Count - 1; i >= 0; i--)
            {
                yield return descriptor.AncestorIds[i];
            }
        }

        private static bool MatchesSharePrincipal(ObjectAccessPolicy policy, BlocksContext? context) => policy.PrincipalType switch
        {
            ObjectPrincipalType.User => !string.IsNullOrEmpty(policy.PrincipalId)
                                        && string.Equals(policy.PrincipalId, context?.UserId, StringComparison.Ordinal),
            ObjectPrincipalType.Role => !string.IsNullOrEmpty(policy.PrincipalId)
                                        && context?.Roles is not null
                                        && context.Roles.Contains(policy.PrincipalId, StringComparer.Ordinal)
                                        && (!HasOrganizationScope(policy)
                                            || string.Equals(policy.OrganizationId, context.OrganizationId, StringComparison.Ordinal)),
            ObjectPrincipalType.Organization => !string.IsNullOrEmpty(policy.PrincipalId)
                                                && !string.IsNullOrEmpty(context?.OrganizationId)
                                                && string.Equals(policy.PrincipalId, context.OrganizationId, StringComparison.Ordinal),
            _ => false,
        };

        private static bool HasOrganizationScope(ObjectAccessPolicy policy) =>
            policy.PrincipalType == ObjectPrincipalType.Role
            && !string.IsNullOrWhiteSpace(policy.OrganizationId)
            && !string.Equals(policy.OrganizationId, "default", StringComparison.OrdinalIgnoreCase);

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

        private static ObjectResourceDescriptor Describe(FileDirectory directory) => new()
        {
            ResourceId = directory.ItemId,
            AncestorIds = directory.AncestorIds ?? new List<string>(),
            InheritsParentAccess = directory.InheritsParentAccess,
            CreatedBy = directory.CreatedBy,
        };

        private static ObjectResourceDescriptor Describe(File file) => new()
        {
            ResourceId = file.ItemId,
            AncestorIds = file.AncestorIds ?? new List<string>(),
            InheritsParentAccess = file.InheritsParentAccess,
            CreatedBy = file.CreatedBy,
        };

        private Task AuditAsync(
            string resourceId, ObjectResourceType resourceType, string action, bool granted,
            string? detail, CancellationToken cancellationToken) =>
            _accessRepository.WriteAuditAsync(new ObjectAuditLog
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
