using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Exercises access-resolved children listing against a real mongod. Pagination and
/// visibility interact here: filtering happens after the read, so a page can come back
/// short, and the boundary between pages has to hold even when siblings share a name.
/// </summary>
[Collection("Mongo")]
public class ContentListingServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _accessRepository;
    private readonly ContentListingService _listing;

    public ContentListingServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<ContentAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<ContentAuditLog>(n));
        provider.Setup(p => p.GetCollection<Directory>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<Directory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<File>(n));

        _accessRepository = new ContentAccessRepository(provider.Object);
        // The listing service now reads through the repositories rather than the provider, so the
        // wiring mirrors production: real DirectoryRepository / FileRepository backed by the same
        // mock provider, which keeps the test's existing "Directories" / "Files" inserts valid.
        _listing = new ContentListingService(
            new DirectoryRepository(provider.Object),
            new FileRepository(provider.Object),
            new ContentAccessResolver(_accessRepository));

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1", organizationId: "org-1", roles: new[] { "editor" });

        // Listing requires a viewable parent, so every test starts from a root folder the
        // caller owns. Child visibility is then decided purely by the children's own rules.
        AddRoot().GetAwaiter().GetResult();
    }

    private Task AddRoot() => _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
    {
        ItemId = "root",
        TenantId = "tenant-1",
        Name = "root",
        SystemName = "root",
        ParentDirectoryID = null,
        Type = StructureType.Directory,
        AncestorIds = new List<string>(),
        InheritsParentAccess = true,
        CreatedBy = "user-1",
        CreatedDate = DateTime.UtcNow,
    });

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private async Task AddFolder(string id, string name, string parent = "root", string createdBy = "someone-else", bool inherits = true, bool archived = false)
        => await _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            SystemName = name.ToLowerInvariant(),
            ParentDirectoryID = parent,
            Type = StructureType.Directory,
            AncestorIds = new List<string> { parent },
            InheritsParentAccess = inherits,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private async Task AddFile(string id, string name, string parent = "root", string createdBy = "someone-else", bool inherits = true, bool archived = false)
        => await _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            SystemName = name.ToLowerInvariant(),
            ParentDirectoryID = parent,
            Type = StructureType.File,
            AncestorIds = new List<string> { parent },
            InheritsParentAccess = inherits,
            IsArchived = archived,
            CreatedBy = createdBy,
            SizeInBytes = 10,
            CreatedDate = DateTime.UtcNow,
        });

    private async Task Grant(string resourceId, ContentPermission permission, ContentEffect effect = ContentEffect.Allow,
        ContentPrincipalType principalType = ContentPrincipalType.User, string? principalId = "user-1")
        => await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = resourceId,
            ResourceType = ContentResourceType.File,
            PrincipalType = principalType,
            PrincipalId = principalId,
            Permission = permission,
            Effect = effect,
        });

    [Fact]
    public async Task An_empty_folder_returns_nothing_and_no_cursor()
    {
        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Should().BeEmpty();
        page.NextCursor.Should().BeNull();
        page.HasMore.Should().BeFalse();
        page.TotalChildCount.Should().Be(0);
    }

    [Fact]
    public async Task A_root_listing_lists_only_top_level_folders_without_needing_a_folder_id()
    {
        // The storage page used to call a removed DmsArtifact endpoint; the new contract
        // takes a folder id, and an empty one now means "the root", so the page can load
        // before the user has opened any folder. Root listings default to folders, because
        // files only have a parent once they have been uploaded into one.
        await _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            ItemId = "cloud",
            TenantId = "tenant-1",
            Name = "Cloud",
            SystemName = "cloud",
            ParentDirectoryID = null,
            Type = StructureType.Directory,
            AncestorIds = new List<string>(),
            InheritsParentAccess = true,
            IsArchived = false,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
        });
        await _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            // Migrated rows can carry an empty parent id rather than null.
            ItemId = "construct",
            TenantId = "tenant-1",
            Name = "Construct",
            SystemName = "construct",
            ParentDirectoryID = "",
            Type = StructureType.Directory,
            AncestorIds = new List<string>(),
            InheritsParentAccess = true,
            IsArchived = false,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
        });
        // A folder nested under "root" must not surface at the top level.
        await AddFolder("nested", "Nested", parent: "root", createdBy: "user-1");
        await AddFile("loose", "loose.txt", parent: "root", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("");

        page.Items.Select(i => i.ItemId).Should().BeEquivalentTo(new[] { "root", "cloud", "construct" });
        page.Items.Should().OnlyContain(i => i.Type == StructureType.Directory);
    }

    [Fact]
    public async Task Children_the_caller_created_are_always_visible()
    {
        await AddFolder("dir-1", "Mine", createdBy: "user-1");
        await AddFile("file-1", "mine.txt", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Select(i => i.ItemId).Should().BeEquivalentTo(new[] { "dir-1", "file-1" });
        page.Items.Should().OnlyContain(i => i.Permissions.CanOwner);
    }

    [Fact]
    public async Task A_child_that_neither_inherits_nor_grants_anything_is_hidden()
    {
        await AddFile("file-1", "secret.txt", inherits: false);

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Should().BeEmpty();
        page.TotalChildCount.Should().Be(1, "the raw count is deliberately unfiltered");
    }

    [Fact]
    public async Task An_inheriting_child_with_no_entries_of_its_own_is_visible()
    {
        // The pure-inherit shortcut: the caller can see the parent, and this child cannot
        // be more restricted than it, so no resolution is needed.
        await AddFile("file-1", "doc.txt");

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task Listing_a_folder_the_caller_cannot_view_returns_nothing()
    {
        // Without this the pure-inherit shortcut would hand every inheriting child to a
        // caller who was never granted the folder in the first place.
        await _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            ItemId = "private",
            TenantId = "tenant-1",
            Name = "private",
            SystemName = "private",
            ParentDirectoryID = null,
            Type = StructureType.Directory,
            AncestorIds = new List<string>(),
            InheritsParentAccess = true,
            CreatedBy = "someone-else",
            CreatedDate = DateTime.UtcNow,
        });
        await AddFile("file-1", "hidden.txt", parent: "private");

        var page = await _listing.GetVisibleChildrenAsync("private");

        page.Items.Should().BeEmpty();
        page.TotalChildCount.Should().Be(0, "an unviewable folder reveals nothing, not even a count");
    }

    [Fact]
    public async Task Listing_a_folder_that_does_not_exist_returns_nothing()
    {
        var page = await _listing.GetVisibleChildrenAsync("no-such-folder");

        page.Items.Should().BeEmpty();
        page.TotalChildCount.Should().Be(0);
    }

    [Fact]
    public async Task An_inheriting_child_with_its_own_deny_is_hidden_even_though_the_parent_is_visible()
    {
        await AddFile("file-1", "open.txt");
        await AddFile("file-2", "blocked.txt");
        await Grant("file-2", ContentPermission.View, ContentEffect.Deny);

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task A_child_that_stops_inheriting_is_hidden_unless_it_grants_access_directly()
    {
        await AddFile("file-1", "detached.txt", inherits: false);

        (await _listing.GetVisibleChildrenAsync("root")).Items.Should().BeEmpty();

        await Grant("file-1", ContentPermission.View);
        var afterGrant = await _listing.GetVisibleChildrenAsync("root");

        afterGrant.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task Permission_flags_are_returned_per_item()
    {
        await AddFile("file-1", "doc.txt");
        await Grant("file-1", ContentPermission.Download);

        var page = await _listing.GetVisibleChildrenAsync("root");

        var item = page.Items.Single();
        item.Permissions.CanView.Should().BeTrue();
        item.Permissions.CanDownload.Should().BeTrue();
        item.Permissions.CanEdit.Should().BeFalse();
        item.Permissions.CanOwner.Should().BeFalse();
    }

    [Fact]
    public async Task Archived_children_are_excluded_from_both_the_page_and_the_count()
    {
        await AddFile("file-1", "live.txt", createdBy: "user-1");
        await AddFile("file-2", "deleted.txt", createdBy: "user-1", archived: true);

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
        page.TotalChildCount.Should().Be(1);
    }

    [Fact]
    public async Task Folders_are_listed_before_files()
    {
        await AddFile("file-1", "aaa.txt", createdBy: "user-1");
        await AddFolder("dir-1", "zzz", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("root");

        page.Items.Select(i => i.ItemId).Should().Equal("dir-1", "file-1");
    }

    [Fact]
    public async Task Paging_walks_every_child_exactly_once()
    {
        for (var i = 0; i < 10; i++)
        {
            await AddFolder($"dir-{i}", $"folder-{i:D2}", createdBy: "user-1");
            await AddFile($"file-{i}", $"doc-{i:D2}.txt", createdBy: "user-1");
        }

        var seen = new List<string>();
        string? cursor = null;
        var guard = 0;

        do
        {
            var page = await _listing.GetVisibleChildrenAsync("root", cursor, limit: 3);
            seen.AddRange(page.Items.Select(i => i.ItemId));
            cursor = page.NextCursor;
            if (++guard > 20) break;
        } while (cursor is not null);

        seen.Should().HaveCount(20);
        seen.Should().OnlyHaveUniqueItems("no child may appear on two pages");
        seen.Take(10).Should().OnlyContain(id => id.StartsWith("dir-", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Paging_holds_its_boundary_when_siblings_share_a_name()
    {
        // A name-only cursor would skip every duplicate after the boundary, so the id is
        // part of the key. This is the case that proves it.
        for (var i = 0; i < 6; i++)
        {
            await AddFile($"file-{i}", "identical.txt", createdBy: "user-1");
        }

        var seen = new List<string>();
        string? cursor = null;
        var guard = 0;

        do
        {
            var page = await _listing.GetVisibleChildrenAsync("root", cursor, limit: 2);
            seen.AddRange(page.Items.Select(i => i.ItemId));
            cursor = page.NextCursor;
            if (++guard > 10) break;
        } while (cursor is not null);

        seen.Should().HaveCount(6);
        seen.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task A_page_is_filled_even_when_most_children_are_invisible()
    {
        // Visibility is applied after the read, so the first slice can be almost entirely
        // filtered away. The caller should still get a full page rather than a short one.
        for (var i = 0; i < 12; i++)
        {
            await AddFile($"file-{i:D2}", $"doc-{i:D2}.txt");
            if (i % 4 != 0) await Grant($"file-{i:D2}", ContentPermission.View, ContentEffect.Deny);
        }

        var page = await _listing.GetVisibleChildrenAsync("root", limit: 3);

        page.Items.Should().HaveCount(3);
        page.Items.Select(i => i.ItemId).Should().Equal("file-00", "file-04", "file-08");
    }

    [Fact]
    public async Task The_type_filter_restricts_the_listing_and_the_count()
    {
        await AddFolder("dir-1", "folder", createdBy: "user-1");
        await AddFile("file-1", "doc.txt", createdBy: "user-1");

        var folders = await _listing.GetVisibleChildrenAsync("root", type: StructureType.Directory);
        folders.Items.Select(i => i.ItemId).Should().Equal("dir-1");
        folders.TotalChildCount.Should().Be(1);

        var files = await _listing.GetVisibleChildrenAsync("root", type: StructureType.File);
        files.Items.Select(i => i.ItemId).Should().Equal("file-1");
        files.TotalChildCount.Should().Be(1);
    }

    [Fact]
    public async Task Search_matches_on_name_without_case_sensitivity()
    {
        await AddFile("file-1", "Quarterly Report.pdf", createdBy: "user-1");
        await AddFile("file-2", "notes.txt", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("root", search: "quarterly");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task Search_treats_regex_metacharacters_as_literal_text()
    {
        // An unescaped search term would either match everything or throw.
        await AddFile("file-1", "report(final).pdf", createdBy: "user-1");
        await AddFile("file-2", "other.txt", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("root", search: "report(final)");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task A_corrupt_cursor_falls_back_to_the_first_page()
    {
        await AddFile("file-1", "doc.txt", createdBy: "user-1");

        var page = await _listing.GetVisibleChildrenAsync("root", cursor: "not a real cursor");

        page.Items.Select(i => i.ItemId).Should().Equal("file-1");
    }

    [Fact]
    public async Task The_requested_limit_is_clamped_to_a_sane_range()
    {
        await AddFile("file-1", "doc.txt", createdBy: "user-1");

        (await _listing.GetVisibleChildrenAsync("root", limit: 0)).Items.Should().HaveCount(1);
        (await _listing.GetVisibleChildrenAsync("root", limit: 100_000)).Items.Should().HaveCount(1);
    }
}
