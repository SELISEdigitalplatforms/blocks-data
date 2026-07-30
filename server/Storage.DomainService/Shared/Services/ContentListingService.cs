using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public interface IContentListingService
    {
        Task<VisibleChildrenPage> GetVisibleChildrenAsync(
            string parentId,
            string? cursor = null,
            int limit = 50,
            StructureType? type = null,
            string? search = null,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Cursor-paginated children listing that only returns what the caller may see.
    /// </summary>
    /// <remarks>
    /// Children live in two collections, so each page is assembled by reading a bounded
    /// slice of both and merging on the shared sort key. Access filtering happens after
    /// the read, which means a page can come back short; the loop keeps pulling until it
    /// has a full page or the stream runs out, so callers never see a short page that
    /// still has more behind it.
    /// </remarks>
    public class ContentListingService : IContentListingService
    {
        internal const int MaxLimit = 200;

        // Bounds the work done for a page whose children are mostly invisible, so a
        // heavily restricted folder cannot turn one request into an unbounded scan.
        private const int MaxRoundsPerPage = 20;

        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessResolver _resolver;

        public ContentListingService(IDbContextProvider dbContextProvider, IContentAccessResolver resolver)
        {
            _dbContextProvider = dbContextProvider;
            _resolver = resolver;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;

        private IMongoCollection<Directory> Directories =>
            _dbContextProvider.GetCollection<Directory>("Directories");

        private IMongoCollection<File> Files =>
            _dbContextProvider.GetCollection<File>("Files");

        public async Task<VisibleChildrenPage> GetVisibleChildrenAsync(
            string parentId,
            string? cursor = null,
            int limit = 50,
            StructureType? type = null,
            string? search = null,
            CancellationToken cancellationToken = default)
        {
            limit = Math.Clamp(limit, 1, MaxLimit);

            // The pure-inherit shortcut below is only sound for children of a parent the
            // caller can already see: it assumes a child's effective policy is a superset
            // of the parent's. Without this gate any caller could list any folder's
            // inheriting children, so the parent check is load bearing, not defensive.
            if (!await CanViewParentAsync(parentId, cancellationToken))
            {
                return new VisibleChildrenPage();
            }

            var page = new VisibleChildrenPage
            {
                TotalChildCount = await CountChildrenAsync(parentId, type, search, cancellationToken),
            };

            var position = ContentCursor.Decode(cursor);
            var visible = new List<VisibleChildItem>();
            var exhausted = false;

            for (var round = 0; round < MaxRoundsPerPage && visible.Count <= limit && !exhausted; round++)
            {
                // One extra row tells us whether anything follows this page without a
                // second query.
                var batch = await ReadMergedSliceAsync(parentId, position, limit + 1, type, search, cancellationToken);
                if (batch.Count == 0)
                {
                    exhausted = true;
                    break;
                }

                position = new ContentCursor
                {
                    Type = batch[^1].Type,
                    Name = batch[^1].Name,
                    ItemId = batch[^1].ItemId,
                };

                if (batch.Count < limit + 1) exhausted = true;

                var allowed = await _resolver.FilterVisibleAsync(batch.Select(b => b.Descriptor).ToList(), cancellationToken);
                var allowedIds = allowed.Select(a => a.ResourceId).ToHashSet(StringComparer.Ordinal);

                foreach (var row in batch.Where(b => allowedIds.Contains(b.ItemId)))
                {
                    row.Item.Permissions = await _resolver.ResolveFlagsAsync(row.Descriptor, cancellationToken);
                    visible.Add(row.Item);
                    if (visible.Count > limit) break;
                }
            }

            page.HasMore = visible.Count > limit;
            if (page.HasMore) visible.RemoveAt(visible.Count - 1);

            page.Items = visible;

            if (page.HasMore && visible.Count > 0)
            {
                var last = visible[^1];
                page.NextCursor = new ContentCursor { Type = last.Type, Name = last.Name, ItemId = last.ItemId }.Encode();
            }

            return page;
        }

        /// <summary>
        /// Resolves View on the folder being listed. A folder that does not exist in this
        /// tenant is treated as not viewable, so a probe for an unknown id cannot be used
        /// to tell an empty folder apart from one the caller may not see.
        /// </summary>
        private async Task<bool> CanViewParentAsync(string parentId, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(parentId)) return false;

            var b = Builders<Directory>.Filter;
            var parent = await Directories
                .Find(b.Eq(d => d.TenantId, TenantId) & b.Eq(d => d.ItemId, parentId))
                .FirstOrDefaultAsync(cancellationToken);

            if (parent is null) return false;

            return await _resolver.ResolveAsync(
                new ContentResourceDescriptor
                {
                    ResourceId = parent.ItemId,
                    AncestorIds = parent.AncestorIds ?? new(),
                    InheritsParentAccess = parent.InheritsParentAccess,
                    CreatedBy = parent.CreatedBy,
                },
                ContentPermission.View,
                cancellationToken);
        }

        private async Task<long> CountChildrenAsync(string parentId, StructureType? type, string? search, CancellationToken cancellationToken)
        {
            long total = 0;

            if (type is null or StructureType.Directory)
            {
                total += await Directories.CountDocumentsAsync(DirectoryFilter(parentId, search), cancellationToken: cancellationToken);
            }

            if (type is null or StructureType.File)
            {
                total += await Files.CountDocumentsAsync(FileFilter(parentId, search), cancellationToken: cancellationToken);
            }

            return total;
        }

        private FilterDefinition<Directory> DirectoryFilter(string parentId, string? search)
        {
            var b = Builders<Directory>.Filter;
            var filter = b.Eq(d => d.TenantId, TenantId)
                         & b.Eq(d => d.ParentDirectoryID, parentId)
                         & b.Eq(d => d.IsArchived, false);

            if (!string.IsNullOrWhiteSpace(search))
            {
                filter &= b.Regex(d => d.Name, new MongoDB.Bson.BsonRegularExpression(Escape(search), "i"));
            }

            return filter;
        }

        private FilterDefinition<File> FileFilter(string parentId, string? search)
        {
            var b = Builders<File>.Filter;
            var filter = b.Eq(f => f.TenantId, TenantId)
                         & b.Eq(f => f.ParentDirectoryID, parentId)
                         & b.Eq(f => f.IsArchived, false);

            if (!string.IsNullOrWhiteSpace(search))
            {
                filter &= b.Regex(f => f.Name, new MongoDB.Bson.BsonRegularExpression(Escape(search), "i"));
            }

            return filter;
        }

        /// <summary>
        /// Reads at most <paramref name="take"/> rows past the cursor from each side and
        /// merges them into one ordered stream.
        /// </summary>
        /// <remarks>
        /// Because folders sort ahead of files, the cursor's type says which collections
        /// can still contribute: once the position is in the files, no folder can follow.
        /// The keyset predicate and the limit are both pushed into the query, so a folder
        /// with many thousands of children never loads more than a page at a time.
        /// </remarks>
        private async Task<List<ChildRow>> ReadMergedSliceAsync(
            string parentId, ContentCursor? position, int take, StructureType? type, string? search, CancellationToken cancellationToken)
        {
            var rows = new List<ChildRow>();

            var wantDirectories = type is null or StructureType.Directory
                                  && position?.Type != StructureType.File;
            var wantFiles = type is null or StructureType.File;

            if (wantDirectories)
            {
                var filter = DirectoryFilter(parentId, search);
                if (position?.Type == StructureType.Directory)
                {
                    filter &= AfterKey<Directory>(position.Name, position.ItemId, nameof(Directory.Name));
                }

                var directories = await Directories.Find(filter)
                    .SortBy(d => d.Name).ThenBy(d => d.ItemId)
                    .Limit(take)
                    .ToListAsync(cancellationToken);

                rows.AddRange(directories.Select(ChildRow.From));
            }

            if (wantFiles)
            {
                var filter = FileFilter(parentId, search);
                if (position?.Type == StructureType.File)
                {
                    filter &= AfterKey<File>(position.Name, position.ItemId, nameof(File.Name));
                }

                var files = await Files.Find(filter)
                    .SortBy(f => f.Name).ThenBy(f => f.ItemId)
                    .Limit(take)
                    .ToListAsync(cancellationToken);

                rows.AddRange(files.Select(ChildRow.From));
            }

            return rows
                .OrderBy(r => r, ChildRowComparer.Instance)
                .Take(take)
                .ToList();
        }

        /// <summary>
        /// Keyset predicate for a compound (name, id) sort: strictly greater by name, or
        /// equal by name and strictly greater by id. Using a plain "greater than name"
        /// would skip every sibling that shares a name with the page boundary.
        /// </summary>
        private static FilterDefinition<T> AfterKey<T>(string name, string itemId, string nameField)
        {
            var b = Builders<T>.Filter;
            return b.Gt(nameField, name)
                   | (b.Eq(nameField, name) & b.Gt("_id", itemId));
        }

        private static string Escape(string value) => System.Text.RegularExpressions.Regex.Escape(value);

        private sealed class ChildRow
        {
            public required string ItemId { get; init; }
            public required string Name { get; init; }
            public required StructureType Type { get; init; }
            public required VisibleChildItem Item { get; init; }
            public required ContentResourceDescriptor Descriptor { get; init; }

            public static ChildRow From(Directory d) => new()
            {
                ItemId = d.ItemId,
                Name = d.Name ?? string.Empty,
                Type = StructureType.Directory,
                Item = new VisibleChildItem
                {
                    ItemId = d.ItemId,
                    Name = d.Name ?? string.Empty,
                    Type = StructureType.Directory,
                    ParentDirectoryId = d.ParentDirectoryID,
                    SizeInBytes = d.SizeInBytes,
                    CreatedDate = d.CreatedDate,
                    LastUpdatedDate = d.LastUpdatedDate,
                    CreatedBy = d.CreatedBy,
                },
                Descriptor = new ContentResourceDescriptor
                {
                    ResourceId = d.ItemId,
                    AncestorIds = d.AncestorIds ?? new(),
                    InheritsParentAccess = d.InheritsParentAccess,
                    CreatedBy = d.CreatedBy,
                },
            };

            public static ChildRow From(File f) => new()
            {
                ItemId = f.ItemId,
                Name = f.Name ?? string.Empty,
                Type = StructureType.File,
                Item = new VisibleChildItem
                {
                    ItemId = f.ItemId,
                    Name = f.Name ?? string.Empty,
                    Type = StructureType.File,
                    ParentDirectoryId = f.ParentDirectoryID,
                    SizeInBytes = f.SizeInBytes,
                    Extension = f.Extension,
                    ContentType = f.ContentType,
                    CreatedDate = f.CreatedDate,
                    LastUpdatedDate = f.LastUpdatedDate,
                    CreatedBy = f.CreatedBy,
                },
                Descriptor = new ContentResourceDescriptor
                {
                    ResourceId = f.ItemId,
                    AncestorIds = f.AncestorIds ?? new(),
                    InheritsParentAccess = f.InheritsParentAccess,
                    CreatedBy = f.CreatedBy,
                },
            };
        }

        private sealed class ChildRowComparer : IComparer<ChildRow>
        {
            public static readonly ChildRowComparer Instance = new();

            public int Compare(ChildRow? x, ChildRow? y)
            {
                if (x is null) return y is null ? 0 : -1;
                if (y is null) return 1;
                return ContentCursor.Compare(x.Type, x.Name, x.ItemId, y.Type, y.Name, y.ItemId);
            }
        }
    }
}
