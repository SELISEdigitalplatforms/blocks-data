using Blocks.Genesis.Entities.Data;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage.ZipDownload;
using XUnitTest.Infrastructure;
using FileDirectory = Blocks.Genesis.Entities.Data.FileDirectory;

namespace XUnitTest.Storage;

/// <summary>
/// The prepare half of the zip download: turning a selection of files and folders into a
/// permission-checked, size-checked list of zip entries saved behind a ticket.
/// </summary>
public class ZipDownloadServicePrepareTests : IDisposable
{
    private readonly Mock<IFileDirectoryRepository> _directories = new();
    private readonly Mock<IObjectAccessResolver> _resolver = new();
    private readonly Mock<IObjectDiscoveryService> _listing = new();
    private readonly Mock<IFileManagementService> _files = new();
    private readonly Mock<IZipTicketStore> _store = new();

    private readonly Dictionary<string, ZipSourceFile> _sources = new();
    private readonly List<(List<string> Ids, bool Authorize)> _resolveCalls = new();
    private readonly List<ZipTicket> _saved = new();

    public ZipDownloadServicePrepareTests()
    {
        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");

        _resolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        _files
            .Setup(f => f.ResolveZipSourcesAsync(It.IsAny<IReadOnlyList<string>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<string> ids, bool authorize, CancellationToken _) =>
            {
                _resolveCalls.Add((ids.ToList(), authorize));
                return ids.Distinct().Where(_sources.ContainsKey).Select(id => _sources[id]).ToList();
            });

        _store
            .Setup(s => s.SaveAsync(It.IsAny<ZipTicket>()))
            .ReturnsAsync((ZipTicket t) =>
            {
                _saved.Add(t);
                return "ticket-1";
            });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private ZipDownloadService CreateSut() => new(
        _directories.Object,
        _resolver.Object,
        _listing.Object,
        _files.Object,
        _store.Object,
        Mock.Of<DomainService.Configuration.IStorageConfigurationProvider>(),
        NullLogger<ZipDownloadService>.Instance);

    private void AddSource(string id, string name, long size = 10)
        => _sources[id] = new ZipSourceFile
        {
            FileId = id,
            Name = name,
            VersionId = "v-" + id,
            VersionNo = 1,
            SizeInBytes = size,
            TenantId = "tenant-1",
        };

    private void AddDirectory(string id, string name, params string[] ancestors)
        => _directories
            .Setup(d => d.FindByIdAsync(id, false, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileDirectory { ItemId = id, Name = name, AncestorIds = ancestors.ToList() });

    private static VisibleChildItem Folder(string id, string name)
        => new() { ItemId = id, Name = name, Type = StructureType.Directory, Permissions = new ObjectPermissionFlags { CanView = true, CanDownload = true } };

    private static VisibleChildItem FileItem(string id, string name, bool canDownload = true)
        => new() { ItemId = id, Name = name, Type = StructureType.File, Permissions = new ObjectPermissionFlags { CanView = true, CanDownload = canDownload } };

    private void SetChildren(string parentId, params VisibleChildItem[] items)
        => SetPage(parentId, null, items, nextCursor: null);

    private void SetPage(string parentId, string? cursor, IEnumerable<VisibleChildItem> items, string? nextCursor)
        => _listing
            .Setup(l => l.GetObjectAsync(parentId, null, null, cursor, ZipDownloadLimits.ListingPageSize, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new VisibleChildrenPage { Items = items.ToList(), NextCursor = nextCursor, HasMore = nextCursor != null });

    private static PrepareZipDownloadRequest Request(IEnumerable<string>? items = null, IEnumerable<string>? dirs = null)
        => new() { ItemIds = (items ?? []).ToList(), DirectoryIds = (dirs ?? []).ToList() };

    private static List<string> Paths(ZipTicket ticket) => ticket.Entries.Select(e => e.ZipPath).ToList();

    private static List<string> FilePaths(ZipTicket ticket)
        => ticket.Entries.Where(e => e.Kind == ZipEntryKind.File).Select(e => e.ZipPath).ToList();

    private static void ShouldFailWith(PrepareZipDownloadResponse response, string code)
    {
        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().ContainKey("zip").WhoseValue.Should().Be(code);
        response.Ticket.Should().BeEmpty();
    }

    [Fact]
    public async Task Loose_files_go_to_the_root()
    {
        AddSource("f1", "a.pdf", 100);
        AddSource("f2", "b.pdf", 250);

        var response = await CreateSut().PrepareAsync(Request(items: ["f1", "f2"]), CancellationToken.None);

        response.IsSuccess.Should().BeTrue();
        response.Ticket.Should().Be("ticket-1");
        response.TenantId.Should().Be("tenant-1");
        response.FileCount.Should().Be(2);
        response.TotalBytes.Should().Be(350);
        response.ZipName.Should().MatchRegex(@"^download-\d{8}-\d{4}\.zip$");

        var ticket = _saved.Should().ContainSingle().Subject;
        Paths(ticket).Should().Equal("a.pdf", "b.pdf");
        ticket.Entries.Should().OnlyContain(e => e.Kind == ZipEntryKind.File && e.Source != null);
        ticket.Entries[0].Source!.FileId.Should().Be("f1");
        ticket.TenantId.Should().Be("tenant-1");
        ticket.UserId.Should().Be("user-1");
        ticket.ConfigurationName.Should().Be("Default");
        ticket.ZipName.Should().Be(response.ZipName);

        _resolveCalls.Should().ContainSingle().Which.Authorize.Should().BeTrue();
    }

    [Fact]
    public async Task Configuration_name_is_carried_to_the_ticket()
    {
        AddSource("f1", "a.pdf");
        var request = Request(items: ["f1"]);
        request.ConfigurationName = "Archive";

        await CreateSut().PrepareAsync(request, CancellationToken.None);

        _saved.Should().ContainSingle().Which.ConfigurationName.Should().Be("Archive");
    }

    [Fact]
    public async Task Folder_keeps_structure_and_empty_folders()
    {
        AddDirectory("D", "Docs");
        SetChildren("D", Folder("S", "Sub"), FileItem("x", "x.txt"));
        SetChildren("S");
        AddSource("x", "x.txt", 42);

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        response.IsSuccess.Should().BeTrue();
        response.ZipName.Should().Be("Docs.zip");
        response.FileCount.Should().Be(1);
        response.TotalBytes.Should().Be(42);

        var ticket = _saved.Should().ContainSingle().Subject;
        ticket.Entries.Select(e => (e.Kind, e.ZipPath)).Should().Equal(
            (ZipEntryKind.Folder, "Docs/"),
            (ZipEntryKind.Folder, "Docs/Sub/"),
            (ZipEntryKind.File, "Docs/x.txt"));
        ticket.Entries.Where(e => e.Kind == ZipEntryKind.Folder).Should().OnlyContain(e => e.Source == null);

        // Folder contents rely on the listing's CanDownload flag, not a second audited check.
        _resolveCalls.Should().ContainSingle();
        _resolveCalls[0].Ids.Should().Equal("x");
        _resolveCalls[0].Authorize.Should().BeFalse();
        _resolver.Verify(r => r.ResolveAsync(
            It.Is<ObjectResourceDescriptor>(d => d.ResourceId == "D"), ObjectPermission.Download, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Folder_children_without_CanDownload_are_skipped()
    {
        AddDirectory("D", "Docs");
        SetChildren("D", FileItem("x", "x.txt"), FileItem("y", "y.txt", canDownload: false));
        AddSource("x", "x.txt");
        AddSource("y", "y.txt");

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        response.FileCount.Should().Be(1);
        FilePaths(_saved.Single()).Should().Equal("Docs/x.txt");
        _resolveCalls.SelectMany(c => c.Ids).Should().NotContain("y");
    }

    [Fact]
    public async Task Denied_or_archived_selected_folder_is_skipped()
    {
        // Denied: the folder exists but Download is refused.
        AddDirectory("D", "Docs");
        SetChildren("D", FileItem("x", "x.txt"));
        AddSource("x", "x.txt");
        _resolver
            .Setup(r => r.ResolveAsync(It.Is<ObjectResourceDescriptor>(d => d.ResourceId == "D"), ObjectPermission.Download, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var denied = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        ShouldFailWith(denied, ZipDownloadLimits.NothingToDownload);

        // Archived or missing: the repository (includeArchived: false) returns nothing.
        SetChildren("E", FileItem("x", "x.txt"));
        var archived = await CreateSut().PrepareAsync(Request(dirs: ["E"]), CancellationToken.None);

        ShouldFailWith(archived, ZipDownloadLimits.NothingToDownload);
        _saved.Should().BeEmpty();
        _listing.Verify(l => l.GetObjectAsync(It.IsAny<string>(), It.IsAny<StructureType?>(), It.IsAny<string?>(),
            It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task File_inside_a_selected_folder_is_included_once()
    {
        AddDirectory("D", "Docs");
        SetChildren("D", FileItem("x", "x.txt"));
        AddSource("x", "x.txt", 7);

        var response = await CreateSut().PrepareAsync(Request(items: ["x"], dirs: ["D"]), CancellationToken.None);

        response.FileCount.Should().Be(1);
        response.TotalBytes.Should().Be(7);
        FilePaths(_saved.Single()).Should().Equal("Docs/x.txt");
        _resolveCalls.Where(c => c.Authorize).SelectMany(c => c.Ids).Should().NotContain("x");
    }

    [Fact]
    public async Task Nested_selected_folder_is_included_once()
    {
        AddDirectory("D", "Docs");
        AddDirectory("Sub", "Sub", "D");
        SetChildren("D", Folder("Sub", "Sub"));
        SetChildren("Sub", FileItem("y", "y.txt"));
        AddSource("y", "y.txt");

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D", "Sub"]), CancellationToken.None);

        response.FileCount.Should().Be(1);
        Paths(_saved.Single()).Should().Equal("Docs/", "Docs/Sub/", "Docs/Sub/y.txt");
        _listing.Verify(l => l.GetObjectAsync("Sub", It.IsAny<StructureType?>(), It.IsAny<string?>(),
            It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        // Two folders were selected, so the name is not taken from either.
        response.ZipName.Should().StartWith("download-");
    }

    [Fact]
    public async Task Nested_folder_is_kept_when_its_selected_ancestor_is_denied()
    {
        AddDirectory("D", "Docs");
        AddDirectory("Sub", "Sub", "D");
        SetChildren("Sub", FileItem("y", "y.txt"));
        AddSource("y", "y.txt");
        _resolver
            .Setup(r => r.ResolveAsync(It.Is<ObjectResourceDescriptor>(d => d.ResourceId == "D"), ObjectPermission.Download, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D", "Sub"]), CancellationToken.None);

        response.IsSuccess.Should().BeTrue();
        Paths(_saved.Single()).Should().Equal("Sub/", "Sub/y.txt");
    }

    [Fact]
    public async Task Walk_follows_listing_cursors()
    {
        AddDirectory("D", "Docs");
        SetPage("D", null, [FileItem("p1", "one.txt")], nextCursor: "c2");
        SetPage("D", "c2", [FileItem("p2", "two.txt")], nextCursor: null);
        AddSource("p1", "one.txt");
        AddSource("p2", "two.txt");

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        response.FileCount.Should().Be(2);
        FilePaths(_saved.Single()).Should().Equal("Docs/one.txt", "Docs/two.txt");
    }

    [Fact]
    public async Task Folder_files_are_resolved_in_listing_page_sized_batches()
    {
        AddDirectory("D", "Docs");
        var items = Enumerable.Range(0, 450).Select(i => FileItem($"f{i}", $"f{i}.txt")).ToArray();
        SetChildren("D", items);
        foreach (var item in items) AddSource(item.ItemId, item.Name);

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        response.FileCount.Should().Be(450);
        _resolveCalls.Select(c => c.Ids.Count).Should().Equal(200, 200, 50);
        _resolveCalls.Should().OnlyContain(c => !c.Authorize);
    }

    [Theory]
    [InlineData(ZipDownloadLimits.MaxFiles, true)]
    [InlineData(ZipDownloadLimits.MaxFiles + 1, false)]
    public async Task Exactly_5000_files_succeeds_and_5001_fails(int count, bool succeeds)
    {
        AddDirectory("D", "Docs");
        var items = Enumerable.Range(0, count).Select(i => FileItem($"f{i}", $"f{i}.txt")).ToArray();
        SetChildren("D", items);
        foreach (var item in items) AddSource(item.ItemId, item.Name, 1);

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        if (succeeds)
        {
            response.IsSuccess.Should().BeTrue();
            response.FileCount.Should().Be(ZipDownloadLimits.MaxFiles);
        }
        else
        {
            ShouldFailWith(response, ZipDownloadLimits.LimitExceeded);
            // The walk stops before resolving anything.
            _resolveCalls.Should().BeEmpty();
        }
    }

    [Theory]
    [InlineData(ZipDownloadLimits.MaxFolders, true)]
    [InlineData(ZipDownloadLimits.MaxFolders + 1, false)]
    public async Task Exactly_5000_folders_succeeds_and_5001_fails_early(int folderCount, bool succeeds)
    {
        // The selected folder counts too, so it holds folderCount - 1 empty subfolders (and one file).
        AddDirectory("D", "Docs");
        _listing
            .Setup(l => l.GetObjectAsync(It.IsAny<string>(), null, null, null, ZipDownloadLimits.ListingPageSize, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new VisibleChildrenPage { Items = [], HasMore = false });
        var children = new[] { FileItem("x", "x.txt") }
            .Concat(Enumerable.Range(0, folderCount - 1).Select(i => Folder($"s{i}", $"s{i}")))
            .ToArray();
        SetChildren("D", children);
        AddSource("x", "x.txt");

        var response = await CreateSut().PrepareAsync(Request(dirs: ["D"]), CancellationToken.None);

        if (succeeds)
        {
            response.IsSuccess.Should().BeTrue();
            _saved.Single().Entries.Count(e => e.Kind == ZipEntryKind.Folder).Should().Be(ZipDownloadLimits.MaxFolders);
        }
        else
        {
            ShouldFailWith(response, ZipDownloadLimits.LimitExceeded);
            _store.Verify(s => s.SaveAsync(It.IsAny<ZipTicket>()), Times.Never);
            _resolveCalls.Should().BeEmpty();
            // The walk stops at the folder that passes the cap: none of the subfolders is ever listed.
            _listing.Verify(l => l.GetObjectAsync(It.IsAny<string>(), It.IsAny<StructureType?>(), It.IsAny<string?>(),
            It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        }
    }

    [Fact]
    public async Task File_limit_counts_folder_and_loose_files_together()
    {
        AddDirectory("D", "Docs");
        var items = Enumerable.Range(0, ZipDownloadLimits.MaxFiles).Select(i => FileItem($"f{i}", $"f{i}.txt")).ToArray();
        SetChildren("D", items);
        foreach (var item in items) AddSource(item.ItemId, item.Name, 1);
        AddSource("loose", "loose.txt", 1);

        var response = await CreateSut().PrepareAsync(Request(items: ["loose"], dirs: ["D"]), CancellationToken.None);

        ShouldFailWith(response, ZipDownloadLimits.LimitExceeded);
    }

    [Theory]
    [InlineData(0L, true)]
    [InlineData(1L, false)]
    public async Task Exactly_2GB_succeeds_and_one_byte_more_fails(long extra, bool succeeds)
    {
        AddSource("f1", "big.bin", ZipDownloadLimits.MaxTotalBytes - 1);
        AddSource("f2", "small.bin", 1 + extra);

        var response = await CreateSut().PrepareAsync(Request(items: ["f1", "f2"]), CancellationToken.None);

        if (succeeds)
        {
            response.IsSuccess.Should().BeTrue();
            response.TotalBytes.Should().Be(ZipDownloadLimits.MaxTotalBytes);
        }
        else
        {
            ShouldFailWith(response, ZipDownloadLimits.LimitExceeded);
        }
    }

    [Fact]
    public async Task Nothing_downloadable_returns_zip_nothing_to_download()
    {
        // The selected file does not resolve (no access, archived or unreadable) and the folder is empty.
        AddDirectory("D", "Docs");
        SetChildren("D", Folder("S", "Sub"));
        SetChildren("S");

        var response = await CreateSut().PrepareAsync(Request(items: ["gone"], dirs: ["D"]), CancellationToken.None);

        ShouldFailWith(response, ZipDownloadLimits.NothingToDownload);
        _saved.Should().BeEmpty();
    }

    [Fact]
    public async Task Limit_failure_saves_no_ticket()
    {
        AddSource("f1", "big.bin", ZipDownloadLimits.MaxTotalBytes + 1);

        var response = await CreateSut().PrepareAsync(Request(items: ["f1"]), CancellationToken.None);

        ShouldFailWith(response, ZipDownloadLimits.LimitExceeded);
        _store.Verify(s => s.SaveAsync(It.IsAny<ZipTicket>()), Times.Never);
    }

    [Fact]
    public async Task Requested_zip_name_overrides_the_folder_name()
    {
        AddDirectory("D", "Docs");
        SetChildren("D", FileItem("x", "x.txt"));
        AddSource("x", "x.txt");
        var request = Request(dirs: ["D"]);
        request.ZipName = "Bundle";

        var response = await CreateSut().PrepareAsync(request, CancellationToken.None);

        response.ZipName.Should().Be("Bundle.zip");
    }
}
