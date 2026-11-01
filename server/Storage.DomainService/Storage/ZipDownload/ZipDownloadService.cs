using System.Buffers;
using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DomainService.Configuration;
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

    /// <summary>
    /// Atomically takes the single-use ticket. Null when it is missing, malformed, expired, already used, corrupt,
    /// or was prepared under a different tenant than the request's.
    /// </summary>
    Task<ZipTicket?> TakeTicketAsync(string ticket, CancellationToken cancellationToken);

    /// <summary>
    /// Writes the ticket's entries as a zip into <paramref name="output"/>, which may be non-seekable, one provider
    /// stream at a time. Files that cannot be opened (or fail before their first byte) are skipped.
    /// </summary>
    /// <exception cref="InvalidOperationException">The ticket's storage configuration no longer exists; nothing was written.</exception>
    /// <exception cref="ZipEntryCopyException">A source failed after its first byte was read; the archive is left unfinished.</exception>
    /// <exception cref="OperationCanceledException"><paramref name="cancellationToken"/> was cancelled; the archive is left unfinished.</exception>
    Task<ZipWriteResult> WriteZipAsync(ZipTicket ticket, Stream output, CancellationToken cancellationToken);
}

/// <summary>Counts of a finished zip write: entries written (folders and files) and file entries skipped.</summary>
public sealed record ZipWriteResult(int EntriesWritten, int EntriesSkipped);

/// <summary>
/// A source stream failed after part of the file was already written into the zip. The entry cannot be undone,
/// so the response must be aborted rather than completed with a silently truncated file.
/// </summary>
public sealed class ZipEntryCopyException : Exception
{
    public ZipEntryCopyException(string fileId, Exception innerException)
        : base($"Reading file '{fileId}' failed partway through its zip entry.", innerException)
    {
        FileId = fileId;
    }

    /// <summary>The id of the file whose source failed (never its name).</summary>
    public string FileId { get; }
}

public sealed class ZipDownloadService : IZipDownloadService
{
    private const string ErrorKey = "zip";
    private const int CopyBufferSize = 81_920;

    private readonly IFileDirectoryRepository _directoryRepository;
    private readonly IObjectAccessResolver _accessResolver;
    private readonly IObjectDiscoveryService _discoveryService;
    private readonly IFileManagementService _fileManagementService;
    private readonly IZipTicketStore _ticketStore;
    private readonly IStorageConfigurationProvider _configurationProvider;
    private readonly ILogger<ZipDownloadService> _logger;

    public ZipDownloadService(
        IFileDirectoryRepository directoryRepository,
        IObjectAccessResolver accessResolver,
        IObjectDiscoveryService discoveryService,
        IFileManagementService fileManagementService,
        IZipTicketStore ticketStore,
        IStorageConfigurationProvider configurationProvider,
        ILogger<ZipDownloadService> logger)
    {
        _directoryRepository = directoryRepository;
        _accessResolver = accessResolver;
        _discoveryService = discoveryService;
        _fileManagementService = fileManagementService;
        _ticketStore = ticketStore;
        _configurationProvider = configurationProvider;
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

    public async Task<ZipTicket?> TakeTicketAsync(string ticket, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        ZipTicket? taken;
        try
        {
            taken = await _ticketStore.TakeAsync(ticket).ConfigureAwait(false);
        }
        catch (JsonException)
        {
            // GETDEL already removed the corrupt value, so it behaves exactly like a missing ticket.
            _logger.LogWarning("[zip-download] ticket-corrupt");
            return null;
        }

        if (taken is null)
        {
            return null;
        }

        // The ticket alone carries the authority, so it only works under the tenant it was prepared for.
        var requestTenantId = BlocksContext.GetContext()?.TenantId;
        if (string.IsNullOrEmpty(requestTenantId) || !string.Equals(taken.TenantId, requestTenantId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[zip-download] ticket-tenant-mismatch ticketTenant={TicketTenantId} requestTenant={RequestTenantId}",
                taken.TenantId, requestTenantId);
            return null;
        }

        return taken;
    }

    public async Task<ZipWriteResult> WriteZipAsync(ZipTicket ticket, Stream output, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(ticket);
        ArgumentNullException.ThrowIfNull(output);

        // Resolved before the archive exists, so a missing configuration fails with nothing written.
        var configuration = await _configurationProvider.GetByNameAsync(ticket.ConfigurationName, cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException($"Storage configuration '{ticket.ConfigurationName}' was not found.");

        var stopwatch = Stopwatch.StartNew();
        var written = 0;
        var skipped = 0;
        var buffer = ArrayPool<byte>.Shared.Rent(CopyBufferSize);

        // ZipArchive writes data descriptors and some local headers synchronously; the adapter queues those and sends
        // them on the next async write, so the response body never sees synchronous IO. Disposing it never drains.
        await using var asyncOutput = new AsyncOnlyOutputStream(output);
        try
        {
            // Deliberately not `await using`: after a failed copy or a cancellation the archive is abandoned unfinished.
            // Disposing it would close the broken entry and append a central directory, handing the user a valid-looking
            // zip with a truncated file, and would keep writing into a response that is already gone. It holds no
            // unmanaged resources, and leaveOpen keeps the output for the caller.
#pragma warning disable CA2000
            var archive = await ZipArchive.CreateAsync(asyncOutput, ZipArchiveMode.Create, leaveOpen: true, entryNameEncoding: null, cancellationToken).ConfigureAwait(false);
#pragma warning restore CA2000

            foreach (var entry in ticket.Entries)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (entry.Kind == ZipEntryKind.Folder)
                {
                    var folderPath = entry.ZipPath.EndsWith('/') ? entry.ZipPath : entry.ZipPath + "/";
                    archive.CreateEntry(folderPath, CompressionLevel.NoCompression);
                    written++;
                }
                else if (await WriteFileEntryAsync(archive, entry, configuration, buffer, cancellationToken).ConfigureAwait(false))
                {
                    written++;
                }
                else
                {
                    skipped++;
                }
            }

            await archive.DisposeAsync().ConfigureAwait(false);

            // Sends whatever the archive wrote synchronously last (the final entry's data descriptor, unopened
            // folder headers). Only reached on success: an aborted archive leaves its queue unsent.
            await asyncOutput.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                "[zip-download] stream-aborted tenant={TenantId} entriesWritten={EntriesWritten} entriesSkipped={EntriesSkipped} elapsedMs={ElapsedMs} reason={Reason}",
                ticket.TenantId, written, skipped, stopwatch.ElapsedMilliseconds, ex.GetType().Name);
            throw;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        _logger.LogInformation(
            "[zip-download] stream-completed tenant={TenantId} entriesWritten={EntriesWritten} entriesSkipped={EntriesSkipped} elapsedMs={ElapsedMs}",
            ticket.TenantId, written, skipped, stopwatch.ElapsedMilliseconds);

        return new ZipWriteResult(written, skipped);
    }

    /// <summary>
    /// Copies one file into the archive. False (skipped) when the source cannot be opened or fails before its first
    /// byte; <see cref="ZipEntryCopyException"/> when it fails after its entry already holds data.
    /// </summary>
    private async Task<bool> WriteFileEntryAsync(
        ZipArchive archive, ZipTicketEntry entry, StorageConfiguration configuration, byte[] buffer, CancellationToken cancellationToken)
    {
        var source = entry.Source;
        if (source is null)
        {
            LogSkipped(string.Empty, "no-source");
            return false;
        }

        var stream = await _fileManagementService.OpenZipSourceAsync(source, configuration, cancellationToken).ConfigureAwait(false);
        if (stream is null)
        {
            LogSkipped(source.FileId, "open-failed");
            return false;
        }

        await using (stream.ConfigureAwait(false))
        {
            // The first chunk is read before the entry exists, so a source that fails straight away is skipped like
            // one that could not be opened, instead of breaking the whole archive.
            int read;
            try
            {
                read = await stream.ReadAsync(buffer.AsMemory(0, CopyBufferSize), cancellationToken).ConfigureAwait(false);
            }
            catch (Exception) when (cancellationToken.IsCancellationRequested)
            {
                // Whatever the provider threw, a read that failed because the client left is a cancellation.
                cancellationToken.ThrowIfCancellationRequested();
                throw;
            }
            catch (Exception ex)
            {
                LogSkipped(source.FileId, "read-failed:" + ex.GetType().Name);
                return false;
            }

            var zipEntry = archive.CreateEntry(entry.ZipPath, CompressionLevel.NoCompression);
            var destination = await zipEntry.OpenAsync(cancellationToken).ConfigureAwait(false);

            // Read and write are separated so only a failing source becomes a ZipEntryCopyException; a failing
            // output (client gone) surfaces as itself.
            while (read > 0)
            {
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
                try
                {
                    read = await stream.ReadAsync(buffer.AsMemory(0, CopyBufferSize), cancellationToken).ConfigureAwait(false);
                }
                catch (Exception) when (cancellationToken.IsCancellationRequested)
                {
                    // A provider may surface the cancelled read as its own exception (IOException, SDK types);
                    // the client leaving is still a cancellation, not a broken file.
                    cancellationToken.ThrowIfCancellationRequested();
                    throw;
                }
                catch (Exception ex)
                {
                    throw new ZipEntryCopyException(source.FileId, ex);
                }
            }

            // Only a fully copied entry is closed; a broken one is left open with the archive (see WriteZipAsync).
            await destination.DisposeAsync().ConfigureAwait(false);
        }

        return true;
    }

    private void LogSkipped(string fileId, string reason)
        => _logger.LogWarning("[zip-download] entry-skipped fileId={FileId} reason={Reason}", fileId, reason);

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

    /// <summary>
    /// Returns false as soon as the folder entries (selected roots and subfolders) pass
    /// <see cref="ZipDownloadLimits.MaxFolders"/> or the folder file candidates pass <see cref="ZipDownloadLimits.MaxFiles"/>;
    /// the walk then stops without listing anything further.
    /// </summary>
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

        // Every folder entry counts, the selected roots included: folder headers are what the stream's pending
        // queue holds (see AsyncOnlyOutputStream), so this cap is what keeps it bounded.
        var folderCount = 0;

        foreach (var directory in directories)
        {
            if (++folderCount > ZipDownloadLimits.MaxFolders) return false;
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
                // The same access-resolved listing the Storage UI shows (get-objects), so a
                // folder zips exactly the children the caller sees there.
                var page = await _discoveryService.GetObjectAsync(
                    directoryId, null, null, cursor, ZipDownloadLimits.ListingPageSize, cancellationToken).ConfigureAwait(false);

                foreach (var child in page.Items)
                {
                    if (child.Type == StructureType.Directory)
                    {
                        if (!visited.Add(child.ItemId)) continue;
                        if (++folderCount > ZipDownloadLimits.MaxFolders) return false;
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
