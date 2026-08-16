using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Maintains the denormalised <c>AncestorIds</c> and <c>FullPath</c> that access
    /// inheritance and breadcrumbs read.
    /// </summary>
    /// <remarks>
    /// Placed alongside the other content services rather than on
    /// <c>FileDirectoryRepository</c> as the specification sketches, because it spans the
    /// directory and file collections and carries real logic that deserves direct test
    /// coverage; the existing repositories are thin wrappers marked
    /// <c>ExcludeFromCodeCoverage</c>.
    /// </remarks>
    public class ContentHierarchyService : IContentHierarchyService
    {
        /// <summary>
        /// Depth ceiling for a walk up the tree. Reaching it means the stored ancestry is
        /// already cyclic, which the visited set detects, so this only bounds the damage.
        /// </summary>
        internal const int MaxDepth = 256;

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessResolver? _resolver;
        private readonly IContentAccessRepository? _accessRepository;
        private readonly IObjectItemWriter? _objectItems;

        public ContentHierarchyService(IDbContextProvider dbContextProvider,
            IContentAccessResolver? resolver = null, IContentAccessRepository? accessRepository = null,
            IObjectItemWriter? objectItems = null)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
            _accessRepository = accessRepository;
            _objectItems = objectItems;
        }

        private IMongoCollection<FileDirectory> Directories =>
            _dbContextProvider.GetCollection<FileDirectory>("FileDirectories");

        private IMongoCollection<File> Files =>
            _dbContextProvider.GetCollection<File>("Files");

        public async Task<List<FileDirectory>> GetAncestorsAsync(string directoryId, CancellationToken cancellationToken = default)
        {
            var chain = new List<FileDirectory>();
            if (string.IsNullOrEmpty(directoryId)) return chain;

            var current = await FindDirectoryAsync(directoryId, cancellationToken);
            if (current is null) return chain;

            // Walking up by parent pointer rather than trusting the cached AncestorIds,
            // because this method is what repairs that cache.
            var visited = new HashSet<string>(StringComparer.Ordinal) { current.ItemId };
            var parentId = current.ParentId;

            for (var depth = 0; depth < MaxDepth && !string.IsNullOrEmpty(parentId); depth++)
            {
                if (!visited.Add(parentId)) break;

                var parent = await FindDirectoryAsync(parentId, cancellationToken);
                if (parent is null) break;

                chain.Add(parent);
                parentId = parent.ParentId;
            }

            chain.Reverse();
            return chain;
        }

        public async Task<int> RebuildAncestorPathsAsync(string directoryId, CancellationToken cancellationToken = default)
        {
            var root = await FindDirectoryAsync(directoryId, cancellationToken);
            if (root is null) return 0;

            var ancestors = await GetAncestorsAsync(directoryId, cancellationToken);
            var rootAncestorIds = ancestors.Select(a => a.ItemId).ToList();
            var rootPath = BuildPath(ancestors.Select(a => a.Name), root.Name);

            var updated = 0;
            updated += await ApplyDirectoryAsync(root.ItemId, rootAncestorIds, rootPath, cancellationToken);
            updated += await ApplyFilesAsync(root.ItemId, Append(rootAncestorIds, root.ItemId), cancellationToken);

            // Breadth-first so each level is written once. The visited set is what stops a
            // pre-existing cycle in the stored parent pointers from looping forever; it is
            // load bearing rather than defensive, because the data can already be wrong
            // when this runs, which is usually why it is being run.
            var visited = new HashSet<string>(StringComparer.Ordinal) { root.ItemId };
            var queue = new Queue<(string Id, List<string> AncestorIds, string Path)>();
            queue.Enqueue((root.ItemId, Append(rootAncestorIds, root.ItemId), rootPath));

            while (queue.Count > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var (parentId, parentAncestors, parentPath) = queue.Dequeue();

                var children = await Directories
                    .Find(Builders<FileDirectory>.Filter.Eq(d => d.ParentId, parentId))
                    .ToListAsync(cancellationToken);

                foreach (var child in children)
                {
                    if (!visited.Add(child.ItemId)) continue;

                    var childPath = $"{parentPath}/{child.Name}";
                    updated += await ApplyDirectoryAsync(child.ItemId, parentAncestors, childPath, cancellationToken);

                    var childAncestors = Append(parentAncestors, child.ItemId);
                    updated += await ApplyFilesAsync(child.ItemId, childAncestors, cancellationToken);

                    queue.Enqueue((child.ItemId, childAncestors, childPath));
                }
            }

            return updated;
        }

        public async Task<MoveDirectoryResult> MoveDirectoryAsync(string directoryId, string? newParentId, CancellationToken cancellationToken = default)
        {
            var directory = await FindDirectoryAsync(directoryId, cancellationToken);
            if (directory is null) return MoveDirectoryResult.SourceNotFound;
            var sourceParent = string.IsNullOrEmpty(directory.ParentId)
                ? null
                : await FindDirectoryAsync(directory.ParentId, cancellationToken);

            // Default directories are system roots and cannot be relocated. They are
            // marked by a "default" entry in their Tags array.
            if (directory.Tags?.Contains("default", StringComparer.OrdinalIgnoreCase) == true)
            {
                return MoveDirectoryResult.IsDefault;
            }

            if (!await AuthorizeMoveAsync(directory, ContentPermission.Delete, cancellationToken))
                return MoveDirectoryResult.NotPermitted;

            if (string.Equals(directoryId, newParentId, StringComparison.Ordinal))
            {
                return MoveDirectoryResult.WouldCreateCycle;
            }

            FileDirectory? target = null;
            if (!string.IsNullOrEmpty(newParentId))
            {
                target = await FindDirectoryAsync(newParentId, cancellationToken);
                if (target is null) return MoveDirectoryResult.TargetNotFound;

                if (!await AuthorizeMoveAsync(target, ContentPermission.Edit, cancellationToken))
                    return MoveDirectoryResult.NotPermitted;

                // Moving a directory beneath itself detaches the whole subtree from the root
                // and leaves a ring that no walk can escape, so it is refused rather than
                // repaired afterwards.
                if (await IsDescendantOfAsync(newParentId, directoryId, cancellationToken))
                {
                    return MoveDirectoryResult.WouldCreateCycle;
                }

                var clash = await Directories
                    .Find(
                        Builders<FileDirectory>.Filter.Eq(d => d.ParentId, newParentId)
                        & Builders<FileDirectory>.Filter.Eq(d => d.Name, directory.Name)
                        & Builders<FileDirectory>.Filter.Ne(d => d.ItemId, directoryId))
                    .AnyAsync(cancellationToken);

                if (clash) return MoveDirectoryResult.NameConflict;
            }

            await Directories.UpdateOneAsync(
                Builders<FileDirectory>.Filter.Eq(d => d.ItemId, directoryId),
                Builders<FileDirectory>.Update
                    .Set(d => d.ParentId, string.IsNullOrEmpty(newParentId) ? null : newParentId)
                    .Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                cancellationToken: cancellationToken);

            await RebuildAncestorPathsAsync(directoryId, cancellationToken);
            await RefreshAffectedDirectoryCachesAsync(sourceParent, target, cancellationToken);
            return MoveDirectoryResult.Moved;
        }

        /// <summary>Walks up from <paramref name="candidateId"/> looking for <paramref name="ancestorId"/>.</summary>
        private async Task<bool> IsDescendantOfAsync(string candidateId, string ancestorId, CancellationToken cancellationToken)
        {
            var visited = new HashSet<string>(StringComparer.Ordinal);
            var currentId = candidateId;

            for (var depth = 0; depth < MaxDepth && !string.IsNullOrEmpty(currentId); depth++)
            {
                if (string.Equals(currentId, ancestorId, StringComparison.Ordinal)) return true;
                if (!visited.Add(currentId)) break;

                var current = await FindDirectoryAsync(currentId, cancellationToken);
                if (current is null) break;
                currentId = current.ParentId;
            }

            return false;
        }

        private Task<FileDirectory> FindDirectoryAsync(string directoryId, CancellationToken cancellationToken) =>
            Directories.Find(Builders<FileDirectory>.Filter.Eq(d => d.ItemId, directoryId))
                .FirstOrDefaultAsync(cancellationToken);

        private async Task<int> ApplyDirectoryAsync(string directoryId, List<string> ancestorIds, string fullPath, CancellationToken cancellationToken)
        {
            var result = await Directories.UpdateOneAsync(
                Builders<FileDirectory>.Filter.Eq(d => d.ItemId, directoryId),
                Builders<FileDirectory>.Update
                    .Set(d => d.AncestorIds, ancestorIds)
                    .Set(d => d.FullPath, fullPath),
                cancellationToken: cancellationToken);
            if (_objectItems is not null)
            {
                var directory = await FindDirectoryAsync(directoryId, cancellationToken);
                if (directory is not null) await _objectItems.UpsertAsync(directory, cancellationToken);
            }

            return (int)result.ModifiedCount;
        }

        private async Task<int> ApplyFilesAsync(string directoryId, List<string> ancestorIds, CancellationToken cancellationToken)
        {
            var result = await Files.UpdateManyAsync(
                Builders<File>.Filter.Eq(f => f.DirectoryId, directoryId),
                Builders<File>.Update.Set(f => f.AncestorIds, ancestorIds),
                cancellationToken: cancellationToken);

            return (int)result.ModifiedCount;
        }

        /// <summary>
        /// Restores the denormalised listing caches after a move. Direct-child counts change
        /// only on the two parents, while subtree size changes for every ancestor on each
        /// affected branch.
        /// </summary>
        private async Task RefreshAffectedDirectoryCachesAsync(FileDirectory? sourceParent, FileDirectory? targetParent,
            CancellationToken cancellationToken)
        {
            var directoryIds = new HashSet<string>(StringComparer.Ordinal);

            foreach (var parent in new[] { sourceParent, targetParent }.Where(p => p is not null))
            {
                directoryIds.Add(parent!.ItemId);
                var ancestors = await GetAncestorsAsync(parent.ItemId, cancellationToken);
                foreach (var ancestor in ancestors)
                    directoryIds.Add(ancestor.ItemId);
            }

            foreach (var directoryId in directoryIds)
                await RefreshDirectoryCacheAsync(directoryId, cancellationToken);
        }

        private async Task RefreshDirectoryCacheAsync(string directoryId, CancellationToken cancellationToken)
        {
            var activeDirectories = Builders<FileDirectory>.Filter.Eq(d => d.ParentId, directoryId)
                & Builders<FileDirectory>.Filter.Eq(d => d.IsArchived, false);
            var activeDirectFiles = Builders<File>.Filter.Eq(f => f.DirectoryId, directoryId)
                & Builders<File>.Filter.Eq(f => f.IsArchived, false);
            var activeSubtreeFiles = Builders<File>.Filter.Eq(f => f.IsArchived, false)
                & (Builders<File>.Filter.AnyEq(f => f.AncestorIds, directoryId)
                    | Builders<File>.Filter.Eq(f => f.DirectoryId, directoryId));

            var childDirectoryCount = await Directories.CountDocumentsAsync(activeDirectories, cancellationToken: cancellationToken);
            var childFileCount = await Files.CountDocumentsAsync(activeDirectFiles, cancellationToken: cancellationToken);
            var files = await Files.Find(activeSubtreeFiles).ToListAsync(cancellationToken);
            var sizeInBytes = files.Sum(f => f.SizeInBytes);

            await Directories.UpdateOneAsync(
                Builders<FileDirectory>.Filter.Eq(d => d.ItemId, directoryId),
                Builders<FileDirectory>.Update
                    .Set(d => d.ChildDirectoryCount, checked((int)childDirectoryCount))
                    .Set(d => d.ChildFileCount, checked((int)childFileCount))
                    .Set(d => d.SizeInBytes, sizeInBytes),
                cancellationToken: cancellationToken);
        }

        private static List<string> Append(IEnumerable<string> existing, string id) =>
            existing.Concat(new[] { id }).ToList();

        private static string BuildPath(IEnumerable<string> ancestorNames, string? name) =>
            "/" + string.Join('/', ancestorNames.Concat(new[] { name ?? string.Empty }).Where(n => !string.IsNullOrEmpty(n)));

        private async Task<bool> AuthorizeMoveAsync(FileDirectory directory, ContentPermission permission, CancellationToken cancellationToken)
        {
            // Optional parameters preserve the standalone hierarchy-repair use case. The DI
            // registration supplies both dependencies, so API moves are always authorized.
            if (_resolver is null || _accessRepository is null) return true;
            var granted = await _resolver.ResolveAsync(new ContentResourceDescriptor
            {
                ResourceId = directory.ItemId,
                AncestorIds = directory.AncestorIds ?? new(),
                InheritsParentAccess = directory.InheritsParentAccess,
                CreatedBy = directory.CreatedBy,
            }, permission, cancellationToken);
            var context = BlocksContext.GetContext();
            var userId = context?.UserId ?? string.Empty;
            await _accessRepository.WriteAuditAsync(new ContentAuditLog
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = context?.TenantId ?? string.Empty,
                ResourceId = directory.ItemId,
                ResourceType = ContentResourceType.Directory,
                UserId = userId,
                Action = "Move",
                Granted = granted,
                Detail = permission.ToString(),
                CreatedDate = DateTime.UtcNow,
                CreatedBy = userId,
            }, cancellationToken);
            return granted;
        }
    }
}
