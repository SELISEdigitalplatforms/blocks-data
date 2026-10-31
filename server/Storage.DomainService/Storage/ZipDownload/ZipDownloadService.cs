using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Microsoft.Extensions.Logging;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;
using FileDirectory = Blocks.Genesis.Entities.Data.FileDirectory;

namespace Storage.DomainService.Storage.ZipDownload;

/// <summary>Builds multi-file zip downloads: resolves a selection into a ticket, then streams it.</summary>
public interface IZipDownloadService
{
    /// <summary>
    /// Resolves the selected files and folders into permission-checked, size-checked zip entries and stores
    /// them behind a single-use ticket. On failure the response carries <c>Errors["zip"]</c> with
    /// <see cref="ZipDownloadLimits.LimitExceeded"/> or <see cref="ZipDownloadLimits.NothingToDownload"/>.
    /// </summary>
    Task<PrepareZipDownloadResponse> PrepareAsync(PrepareZipDownloadRequest request, CancellationToken cancellationToken);
}

public sealed class ZipDownloadService : IZipDownloadService
{
    private const string ErrorKey = "zip";

    private readonly IFileDirectoryRepository _directoryRepository;
    private readonly IObjectAccessResolver _accessResolver;
    private readonly IObjectListingService _listingService;
    private readonly IFileManagementService _fileManagementService;
    private readonly IZipTicketStore _ticketStore;
    private readonly ILogger<ZipDownloadService> _logger;

    public ZipDownloadService(
        IFileDirectoryRepository directoryRepository,
        IObjectAccessResolver accessResolver,
        IObjectListingService listingService,
        IFileManagementService fileManagementService,
        IZipTicketStore ticketStore,
        ILogger<ZipDownloadService> logger)
    {
        _directoryRepository = directoryRepository;
        _accessResolver = accessResolver;
        _listingService = listingService;
        _fileManagementService = fileManagementService;
        _ticketStore = ticketStore;
        _logger = logger;
    }

    public async Task<PrepareZipDownloadResponse> PrepareAsync(PrepareZipDownloadRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var context = BlocksContext.GetContext();
        var tenantId = context?.TenantId ?? string.Empty;
        var userId = context?.UserId ?? string.Empty;

        var itemIds = DistinctIds(request.ItemIds);
        var directoryIds = DistinctIds(request.DirectoryIds);
        var requestedCount = itemIds.Count + directoryIds.Count;

        var paths = new ZipPathBuilder();
        var entries = new List<ZipTicketEntry>();

        // 1. Selected folders: must exist, not be archived, and allow Download. A folder nested inside
        //    another kept selected folder is dropped, because the outer folder's walk already covers it.
        var directories = await LoadSelectedDirectoriesAsync(directoryIds, cancellationToken).ConfigureAwait(false);

        // 2. Walk each kept folder breadth-first, collecting folder entries and downloadable file candidates.
        var candidates = new List<FolderFileCandidate>();
        var collectedIds = new HashSet<string>(StringComparer.Ordinal);
        var withinLimit = await WalkDirectoriesAsync(directories, paths, entries, candidates, collectedIds, cancellationToken).ConfigureAwait(false);
        if (!withinLimit)
        {
            return Fail(ZipDownloadLimits.LimitExceeded, tenantId, userId, requestedCount);
        }

        // 3. Loose files already reached through a selected folder appear only once, inside that folder.
        var looseIds = itemIds.Where(id => !collectedIds.Contains(id)).ToList();
        var looseSources = looseIds.Count == 0
            ? new List<ZipSourceFile>()
            : await _fileManagementService.ResolveZipSourcesAsync(looseIds, authorize: true, cancellationToken).ConfigureAwait(false);

        var folderSources = await ResolveFolderFilesAsync(candidates, cancellationToken).ConfigureAwait(false);

        // 4. Limits apply to the files that survived resolution.
        var fileCount = looseSources.Count + folderSources.Count;
        var totalBytes = looseSources.Sum(s => s.SizeInBytes) + folderSources.Values.Sum(s => s.SizeInBytes);
        if (fileCount > ZipDownloadLimits.MaxFiles || totalBytes > ZipDownloadLimits.MaxTotalBytes)
        {
            return Fail(ZipDownloadLimits.LimitExceeded, tenantId, userId, requestedCount);
        }

        if (fileCount == 0)
        {
            return Fail(ZipDownloadLimits.NothingToDownload, tenantId, userId, requestedCount);
        }

        foreach (var candidate in candidates)
        {
            if (folderSources.TryGetValue(candidate.FileId, out var source))
            {
                entries.Add(FileEntry(paths.AddFile(candidate.ParentPath, candidate.Name), source));
            }
        }

        foreach (var source in looseSources)
        {
            entries.Add(FileEntry(paths.AddFile(string.Empty, source.Name), source));
        }

        // 5. A lone selected folder names the zip; a requested name overrides it.
        var singleFolderName = directoryIds.Count == 1 && itemIds.Count == 0 && directories.Count == 1
            ? directories[0].Name
            : null;
        var zipName = ZipNaming.BuildZipName(request.ZipName, singleFolderName, DateTime.UtcNow);

        // 6. Store the resolved download behind a single-use ticket.
        var ticket = await _ticketStore.SaveAsync(new ZipTicket
        {
            TenantId = tenantId,
            ConfigurationName = string.IsNullOrWhiteSpace(request.ConfigurationName)
                ? Constants.DefaultConfigurationName
                : request.ConfigurationName,
            UserId = userId,
            ZipName = zipName,
            Entries = entries,
        }).ConfigureAwait(false);

        _logger.LogInformation(
            "[zip-download] prepared tenant={TenantId} user={UserId} requested={RequestedCount} files={FileCount} bytes={TotalBytes}",
            tenantId, userId, requestedCount, fileCount, totalBytes);

        return new PrepareZipDownloadResponse
        {
            IsSuccess = true,
            Ticket = ticket,
            TenantId = tenantId,
            FileCount = fileCount,
            TotalBytes = totalBytes,
            ZipName = zipName,
        };
    }

    private async Task<List<FileDirectory>> LoadSelectedDirectoriesAsync(List<string> directoryIds, CancellationToken cancellationToken)
    {
        var allowed = new List<FileDirectory>(directoryIds.Count);
        foreach (var directoryId in directoryIds)
        {
            var directory = await _directoryRepository.FindByIdAsync(directoryId, includeArchived: false, cancellationToken).ConfigureAwait(false);
            if (directory is null || directory.IsArchived) continue;
            if (!await _accessResolver.ResolveAsync(ObjectListingService.Describe(directory), ObjectPermission.Download, cancellationToken).ConfigureAwait(false)) continue;
            allowed.Add(directory);
        }

        var allowedIds = allowed.Select(d => d.ItemId).ToHashSet(StringComparer.Ordinal);
        return allowed
            .Where(d => d.AncestorIds is null || !d.AncestorIds.Any(allowedIds.Contains))
            .ToList();
    }

    /// <summary>Returns false as soon as the folder file candidates pass <see cref="ZipDownloadLimits.MaxFiles"/>.</summary>
    private async Task<bool> WalkDirectoriesAsync(
        List<FileDirectory> directories,
        ZipPathBuilder paths,
        List<ZipTicketEntry> entries,
        List<FolderFileCandidate> candidates,
        HashSet<string> collectedIds,
        CancellationToken cancellationToken)
    {
        var visited = directories.Select(d => d.ItemId).ToHashSet(StringComparer.Ordinal);
        var queue = new Queue<(string DirectoryId, string Path)>();

        foreach (var directory in directories)
        {
            var path = paths.AddFolder(string.Empty, directory.Name);
            entries.Add(FolderEntry(path));
            queue.Enqueue((directory.ItemId, path));
        }

        while (queue.Count > 0)
        {
            var (directoryId, parentPath) = queue.Dequeue();
            string? cursor = null;

            do
            {
                var page = await _listingService.GetVisibleChildrenAsync(
                    directoryId, cursor, ZipDownloadLimits.ListingPageSize, null, null, cancellationToken).ConfigureAwait(false);

                foreach (var child in page.Items)
                {
                    if (child.Type == StructureType.Directory)
                    {
                        if (!visited.Add(child.ItemId)) continue;
                        var path = paths.AddFolder(parentPath, child.Name);
                        entries.Add(FolderEntry(path));
                        queue.Enqueue((child.ItemId, path));
                    }
                    else if (child.Type == StructureType.File && child.Permissions.CanDownload && collectedIds.Add(child.ItemId))
                    {
                        candidates.Add(new FolderFileCandidate(child.ItemId, parentPath, child.Name));
                        if (candidates.Count > ZipDownloadLimits.MaxFiles) return false;
                    }
                }

                cursor = page.HasMore ? page.NextCursor : null;
            }
            while (cursor is not null);
        }

        return true;
    }

    /// <summary>
    /// Resolves folder files without a second access check: the listing's CanDownload flag already decided them.
    /// </summary>
    private async Task<Dictionary<string, ZipSourceFile>> ResolveFolderFilesAsync(List<FolderFileCandidate> candidates, CancellationToken cancellationToken)
    {
        var resolved = new Dictionary<string, ZipSourceFile>(StringComparer.Ordinal);
        foreach (var batch in candidates.Chunk(ZipDownloadLimits.ListingPageSize))
        {
            var sources = await _fileManagementService.ResolveZipSourcesAsync(
                batch.Select(c => c.FileId).ToList(), authorize: false, cancellationToken).ConfigureAwait(false);
            foreach (var source in sources)
            {
                resolved[source.FileId] = source;
            }
        }

        return resolved;
    }

    private PrepareZipDownloadResponse Fail(string code, string tenantId, string userId, int requestedCount)
    {
        _logger.LogInformation(
            "[zip-download] prepare-failed tenant={TenantId} user={UserId} requested={RequestedCount} code={ErrorCode}",
            tenantId, userId, requestedCount, code);

        return new PrepareZipDownloadResponse
        {
            IsSuccess = false,
            TenantId = tenantId,
            Errors = new Dictionary<string, string> { [ErrorKey] = code },
        };
    }

    private static List<string> DistinctIds(List<string>? ids)
        => (ids ?? new List<string>()).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList();

    private static ZipTicketEntry FolderEntry(string path) => new() { Kind = ZipEntryKind.Folder, ZipPath = path + "/" };

    private static ZipTicketEntry FileEntry(string path, ZipSourceFile source) => new() { Kind = ZipEntryKind.File, ZipPath = path, Source = source };

    private sealed record FolderFileCandidate(string FileId, string ParentPath, string Name);
}
