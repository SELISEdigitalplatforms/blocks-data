using Blocks.Genesis;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Cursor-paginated children listing that only returns what the caller may see.
    /// </summary>
    /// <remarks>
    /// No Mongo access lives here. Reads go through <see cref="IFileDirectoryRepository"/> and
    /// <see cref="IFileRepository"/>, so the listing concerns (access resolution, merging
    /// directorys-ahead-of-files, pagination cursor) sit one layer above the data access ones
    /// (filter building, keyset predicates, tenant scoping). Each page is assembled by reading
    /// a bounded slice of both kinds and merging on the shared sort key; access filtering happens
    /// after the read, which means a page can come back short, so the loop keeps pulling until it
    /// has a full page or the stream runs out.
    /// </remarks>
    public class ContentListingService : IContentListingService
    {
        internal const int MaxLimit = 200;

        // Bounds the work done for a page whose children are mostly invisible, so a
        // heavily restricted directory cannot turn one request into an unbounded scan.
        private const int MaxRoundsPerPage = 20;

        private readonly IFileDirectoryRepository _directoryRepository;
        private readonly IFileRepository _fileRepository;
        private readonly IContentAccessResolver _resolver;

        public ContentListingService(
            IFileDirectoryRepository directoryRepository,
            IFileRepository fileRepository,
            IContentAccessResolver resolver)
        {
            _directoryRepository = directoryRepository;
            _fileRepository = fileRepository;
            _resolver = resolver;
        }

        public async Task<VisibleChildrenPage> GetVisibleChildrenAsync(
            string parentId,
            string? cursor = null,
            int limit = 50,
            StructureType? type = null,
            string? search = null,
            CancellationToken cancellationToken = default)
        {
            limit = Math.Clamp(limit, 1, MaxLimit);

            // The root listing has no parent directory to gate visibility against, so it is
            // open to any caller that already holds the endpoint permission; per-item
            // resolution below still hides directorys the caller may not see. Root listings
            // also default to directorys only, because files only acquire a parent on upload.
            var isRoot = string.IsNullOrWhiteSpace(parentId);

            // The pure-inherit shortcut below is only sound for children of a parent the
            // caller can already see: it assumes a child's effective policy is a superset
            // of the parent's. Without this gate any caller could list any directory's
            // inheriting children, so the parent check is load bearing, not defensive.
            FileDirectory? parent = null;
            if (!isRoot)
            {
                parent = await _directoryRepository.FindByIdAsync(parentId, includeArchived: false, cancellationToken);
                if (parent is null || !await CanViewAsync(parent, cancellationToken))
                {
                    return new VisibleChildrenPage();
                }
            }

            var effectiveType = isRoot && type is null ? StructureType.Directory : type;

            var page = new VisibleChildrenPage
            {
                TotalChildCount = await CountChildrenAsync(parentId, effectiveType, search, cancellationToken),
            };

            var position = ContentCursor.Decode(cursor);
            var visible = new List<VisibleChildItem>();
            var exhausted = false;

            for (var round = 0; round < MaxRoundsPerPage && visible.Count <= limit && !exhausted; round++)
            {
                // One extra row tells us whether anything follows this page without a second query.
                var batch = await ReadMergedSliceAsync(parentId, position, limit + 1, effectiveType, search, cancellationToken);
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

        private async Task<bool> CanViewAsync(FileDirectory parent, CancellationToken cancellationToken)
            => await _resolver.ResolveAsync(Describe(parent), ContentPermission.View, cancellationToken);

        private async Task<long> CountChildrenAsync(string parentId, StructureType? type, string? search, CancellationToken cancellationToken)
        {
            long total = 0;
            var ctx = BlocksContext.GetContext();
            Console.WriteLine($"TenantId: {ctx.TenantId}, original TenantId: {ctx.OriginalTenantId}, UserId: {ctx.UserId}, Roles: {string.Join(", ", ctx.Roles)}");

            if (type is null or StructureType.Directory)
            {
                total += await _directoryRepository.CountChildrenAsync(parentId, search, cancellationToken);
            }

            if (type is null or StructureType.File)
            {
                total += await _fileRepository.CountChildrenAsync(parentId, search, cancellationToken);
            }

            return total;
        }

        /// <summary>
        /// Reads at most <paramref name="take"/> rows past the cursor from each kind and merges
        /// them into one ordered stream.
        /// </summary>
        /// <remarks>
        /// Directorys sort ahead of files, so the cursor's type says which kinds can still
        /// contribute: once the position is in the files, no directory can follow. Each repo applies
        /// both the keyset predicate and the limit inside the query, so a directory with many
        /// thousands of children never loads more than a page at a time.
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
                // The cursor continues from inside the directories until it crosses into the files.
                var afterName = position?.Type == StructureType.Directory ? position.Name : null;
                var afterId = position?.Type == StructureType.Directory ? position.ItemId : null;

                var directories = await _directoryRepository.FindChildrenAsync(
                    parentId, afterName, afterId, take, search, cancellationToken);

                rows.AddRange(directories.Select(ChildRow.From));
            }

            if (wantFiles)
            {
                // Once we have crossed into files the cursor only continues the file stream; before
                // that there is no "after" file to skip past.
                var afterName = position?.Type == StructureType.File ? position.Name : null;
                var afterId = position?.Type == StructureType.File ? position.ItemId : null;

                var files = await _fileRepository.FindChildrenAsync(
                    parentId, afterName, afterId, take, search, cancellationToken);

                rows.AddRange(files.Select(ChildRow.From));
            }

            return rows
                .OrderBy(r => r, ChildRowComparer.Instance)
                .Take(take)
                .ToList();
        }

        private static ContentResourceDescriptor Describe(FileDirectory directory) => new()
        {
            ResourceId = directory.ItemId,
            AncestorIds = directory.AncestorIds ?? new List<string>(),
            InheritsParentAccess = directory.InheritsParentAccess,
            CreatedBy = directory.CreatedBy,
        };

        private sealed class ChildRow
        {
            public required string ItemId { get; init; }
            public required string Name { get; init; }
            public required StructureType Type { get; init; }
            public required VisibleChildItem Item { get; init; }
            public required ContentResourceDescriptor Descriptor { get; init; }

            public static ChildRow From(FileDirectory d) => new()
            {
                ItemId = d.ItemId,
                Name = d.Name ?? string.Empty,
                Type = StructureType.Directory,
                Item = new VisibleChildItem
                {
                    ItemId = d.ItemId,
                    Name = d.Name ?? string.Empty,
                    Type = StructureType.Directory,
                    ParentDirectoryId = d.ParentId,
                    SizeInBytes = d.SizeInBytes,
                    CreatedDate = d.CreatedDate,
                    LastUpdatedDate = d.LastUpdatedDate,
                    CreatedBy = d.CreatedBy,
                    IsDefault = d.Tags != null && d.Tags.Contains("default", StringComparer.OrdinalIgnoreCase),
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
                    ParentDirectoryId = f.DirectoryId,
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
