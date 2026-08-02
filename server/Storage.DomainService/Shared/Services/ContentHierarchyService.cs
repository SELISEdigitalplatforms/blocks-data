using Blocks.Genesis;
using MongoDB.Driver;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>Outcome of a move, so callers can distinguish refusals from failures.</summary>
    public enum MoveFolderResult
    {
        Moved = 0,
        SourceNotFound = 1,
        TargetNotFound = 2,
        /// <summary>The target is the folder itself or one of its descendants.</summary>
        WouldCreateCycle = 3,
        /// <summary>A sibling in the target already uses this name.</summary>
        NameConflict = 4,
    }

    public interface IContentHierarchyService
    {
        /// <summary>Ancestors of a folder, ordered root first. Empty for a root folder.</summary>
        Task<List<Directory>> GetAncestorsAsync(string folderId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Recomputes cached ancestry and path for a folder and everything beneath it.
        /// Safe to run on an already-consistent subtree.
        /// </summary>
        Task<int> RebuildAncestorPathsAsync(string folderId, CancellationToken cancellationToken = default);

        Task<MoveFolderResult> MoveFolderAsync(string folderId, string? newParentId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Maintains the denormalised <c>AncestorIds</c> and <c>FullPath</c> that access
    /// inheritance and breadcrumbs read.
    /// </summary>
    /// <remarks>
    /// Placed alongside the other content services rather than on
    /// <c>DirectoryRepository</c> as the specification sketches, because it spans the
    /// folder and file collections and carries real logic that deserves direct test
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

        public ContentHierarchyService(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        private IMongoCollection<Directory> Directories =>
            _dbContextProvider.GetCollection<Directory>("Directories");

        private IMongoCollection<File> Files =>
            _dbContextProvider.GetCollection<File>("Files");

        public async Task<List<Directory>> GetAncestorsAsync(string folderId, CancellationToken cancellationToken = default)
        {
            var chain = new List<Directory>();
            if (string.IsNullOrEmpty(folderId)) return chain;

            var current = await FindFolderAsync(folderId, cancellationToken);
            if (current is null) return chain;

            // Walking up by parent pointer rather than trusting the cached AncestorIds,
            // because this method is what repairs that cache.
            var visited = new HashSet<string>(StringComparer.Ordinal) { current.ItemId };
            var parentId = current.ParentDirectoryID;

            for (var depth = 0; depth < MaxDepth && !string.IsNullOrEmpty(parentId); depth++)
            {
                if (!visited.Add(parentId)) break;

                var parent = await FindFolderAsync(parentId, cancellationToken);
                if (parent is null) break;

                chain.Add(parent);
                parentId = parent.ParentDirectoryID;
            }

            chain.Reverse();
            return chain;
        }

        public async Task<int> RebuildAncestorPathsAsync(string folderId, CancellationToken cancellationToken = default)
        {
            var root = await FindFolderAsync(folderId, cancellationToken);
            if (root is null) return 0;

            var ancestors = await GetAncestorsAsync(folderId, cancellationToken);
            var rootAncestorIds = ancestors.Select(a => a.ItemId).ToList();
            var rootPath = BuildPath(ancestors.Select(a => a.Name), root.Name);

            var updated = 0;
            updated += await ApplyFolderAsync(root.ItemId, rootAncestorIds, rootPath, cancellationToken);
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
                    .Find(Builders<Directory>.Filter.Eq(d => d.ParentDirectoryID, parentId))
                    .ToListAsync(cancellationToken);

                foreach (var child in children)
                {
                    if (!visited.Add(child.ItemId)) continue;

                    var childPath = $"{parentPath}/{child.Name}";
                    updated += await ApplyFolderAsync(child.ItemId, parentAncestors, childPath, cancellationToken);

                    var childAncestors = Append(parentAncestors, child.ItemId);
                    updated += await ApplyFilesAsync(child.ItemId, childAncestors, cancellationToken);

                    queue.Enqueue((child.ItemId, childAncestors, childPath));
                }
            }

            return updated;
        }

        public async Task<MoveFolderResult> MoveFolderAsync(string folderId, string? newParentId, CancellationToken cancellationToken = default)
        {
            var folder = await FindFolderAsync(folderId, cancellationToken);
            if (folder is null) return MoveFolderResult.SourceNotFound;

            if (string.Equals(folderId, newParentId, StringComparison.Ordinal))
            {
                return MoveFolderResult.WouldCreateCycle;
            }

            if (!string.IsNullOrEmpty(newParentId))
            {
                var target = await FindFolderAsync(newParentId, cancellationToken);
                if (target is null) return MoveFolderResult.TargetNotFound;

                // Moving a folder beneath itself detaches the whole subtree from the root
                // and leaves a ring that no walk can escape, so it is refused rather than
                // repaired afterwards.
                if (await IsDescendantOfAsync(newParentId, folderId, cancellationToken))
                {
                    return MoveFolderResult.WouldCreateCycle;
                }

                var clash = await Directories
                    .Find(
                        Builders<Directory>.Filter.Eq(d => d.ParentDirectoryID, newParentId)
                        & Builders<Directory>.Filter.Eq(d => d.Name, folder.Name)
                        & Builders<Directory>.Filter.Ne(d => d.ItemId, folderId))
                    .AnyAsync(cancellationToken);

                if (clash) return MoveFolderResult.NameConflict;
            }

            await Directories.UpdateOneAsync(
                Builders<Directory>.Filter.Eq(d => d.ItemId, folderId),
                Builders<Directory>.Update
                    .Set(d => d.ParentDirectoryID, string.IsNullOrEmpty(newParentId) ? null : newParentId)
                    .Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                cancellationToken: cancellationToken);

            await RebuildAncestorPathsAsync(folderId, cancellationToken);
            return MoveFolderResult.Moved;
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

                var current = await FindFolderAsync(currentId, cancellationToken);
                if (current is null) break;
                currentId = current.ParentDirectoryID;
            }

            return false;
        }

        private Task<Directory> FindFolderAsync(string folderId, CancellationToken cancellationToken) =>
            Directories.Find(Builders<Directory>.Filter.Eq(d => d.ItemId, folderId))
                .FirstOrDefaultAsync(cancellationToken);

        private async Task<int> ApplyFolderAsync(string folderId, List<string> ancestorIds, string fullPath, CancellationToken cancellationToken)
        {
            var result = await Directories.UpdateOneAsync(
                Builders<Directory>.Filter.Eq(d => d.ItemId, folderId),
                Builders<Directory>.Update
                    .Set(d => d.AncestorIds, ancestorIds)
                    .Set(d => d.FullPath, fullPath),
                cancellationToken: cancellationToken);

            return (int)result.ModifiedCount;
        }

        private async Task<int> ApplyFilesAsync(string folderId, List<string> ancestorIds, CancellationToken cancellationToken)
        {
            var result = await Files.UpdateManyAsync(
                Builders<File>.Filter.Eq(f => f.ParentDirectoryID, folderId),
                Builders<File>.Update.Set(f => f.AncestorIds, ancestorIds),
                cancellationToken: cancellationToken);

            return (int)result.ModifiedCount;
        }

        private static List<string> Append(IEnumerable<string> existing, string id) =>
            existing.Concat(new[] { id }).ToList();

        private static string BuildPath(IEnumerable<string> ancestorNames, string? name) =>
            "/" + string.Join('/', ancestorNames.Concat(new[] { name ?? string.Empty }).Where(n => !string.IsNullOrEmpty(n)));
    }
}
