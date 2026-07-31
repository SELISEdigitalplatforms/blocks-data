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
/// Covers search and the trash. Both are reads that cross the whole tenant rather than
/// one folder, so the case that matters most is that a match the caller may not view
/// never reaches them: a search that leaked names would be a directory listing of
/// everything, which is exactly what the access model exists to prevent.
/// </summary>
[Collection("Mongo")]
public class ContentDiscoveryServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _accessRepository;
    private readonly ContentDiscoveryService _discovery;

    public ContentDiscoveryServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<Directory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<Directory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAuditLog>(n));

        _accessRepository = new ContentAccessRepository(provider.Object);
        _discovery = new ContentDiscoveryService(
            provider.Object, new ContentAccessResolver(_accessRepository), _accessRepository);

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1", organizationId: "org-1", roles: new[] { "editor" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private IMongoCollection<Directory> Directories => _db.GetCollection<Directory>("Directories");
    private IMongoCollection<File> Files => _db.GetCollection<File>("Files");

    private Task SeedFolder(
        string id, string name, string createdBy = "user-1", bool archived = false,
        List<string>? ancestorIds = null)
        => Directories.InsertOneAsync(new Directory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            SystemName = name.ToLowerInvariant(),
            Type = StructureType.Directory,
            AncestorIds = ancestorIds ?? new List<string>(),
            InheritsParentAccess = true,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private Task SeedFile(
        string id, string name, string createdBy = "user-1", bool archived = false,
        List<string>? ancestorIds = null)
        => Files.InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            Type = StructureType.File,
            AncestorIds = ancestorIds ?? new List<string>(),
            InheritsParentAccess = true,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    // ---------- Search ----------

    [Fact]
    public async Task Search_matches_a_substring_of_the_name()
    {
        await SeedFolder("dir-1", "Quarterly Reports");
        await SeedFile("file-1", "budget.xlsx");

        var page = await _discovery.SearchAsync("report");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("dir-1");
    }

    [Fact]
    public async Task Search_ignores_case()
    {
        await SeedFolder("dir-1", "Quarterly Reports");

        (await _discovery.SearchAsync("QUARTERLY")).Items.Should().ContainSingle();
    }

    [Fact]
    public async Task Search_returns_both_folders_and_files()
    {
        await SeedFolder("dir-1", "report archive");
        await SeedFile("file-1", "report.pdf");

        var page = await _discovery.SearchAsync("report");

        page.Items.Should().HaveCount(2);
        page.Items.Select(i => i.Type).Should().Contain(new[] { StructureType.Directory, StructureType.File });
    }

    [Fact]
    public async Task Search_can_be_narrowed_to_one_kind()
    {
        await SeedFolder("dir-1", "report archive");
        await SeedFile("file-1", "report.pdf");

        var folders = await _discovery.SearchAsync("report", type: StructureType.Directory);
        var files = await _discovery.SearchAsync("report", type: StructureType.File);

        folders.Items.Should().ContainSingle().Which.ItemId.Should().Be("dir-1");
        files.Items.Should().ContainSingle().Which.ItemId.Should().Be("file-1");
    }

    [Fact]
    public async Task Search_treats_regex_metacharacters_as_literal_text()
    {
        // Without escaping, "report(1)" would compile as a group and match "report",
        // and a caller could supply a pattern that runs against every name in the tenant.
        await SeedFile("file-1", "report(1).pdf");
        await SeedFile("file-2", "report.pdf");

        var page = await _discovery.SearchAsync("report(1)");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("file-1");
    }

    [Fact]
    public async Task Search_can_be_scoped_to_a_subtree()
    {
        await SeedFolder("root", "Root");
        await SeedFile("inside", "report-inside.pdf", ancestorIds: new List<string> { "root" });
        await SeedFile("outside", "report-outside.pdf");

        var page = await _discovery.SearchAsync("report", folderId: "root");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("inside");
    }

    [Fact]
    public async Task Search_skips_archived_content()
    {
        await SeedFile("file-1", "report.pdf", archived: true);

        (await _discovery.SearchAsync("report")).Items.Should().BeEmpty(
            "trashed content is found through the trash, not through search");
    }

    [Fact]
    public async Task Search_never_returns_content_the_caller_cannot_view()
    {
        await SeedFile("mine", "report-mine.pdf");
        await SeedFile("theirs", "report-theirs.pdf", createdBy: "someone-else");

        var page = await _discovery.SearchAsync("report");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("mine");
    }

    [Fact]
    public async Task Search_finds_another_users_content_once_it_is_shared()
    {
        await SeedFile("theirs", "report-theirs.pdf", createdBy: "someone-else");
        await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "theirs",
            ResourceType = ContentResourceType.File,
            PrincipalType = ContentPrincipalType.User,
            PrincipalId = "user-1",
            Permission = ContentPermission.View,
            Effect = ContentEffect.Allow,
        });

        (await _discovery.SearchAsync("report")).Items.Should().ContainSingle();
    }

    [Fact]
    public async Task An_empty_query_returns_nothing_rather_than_everything()
    {
        await SeedFile("file-1", "report.pdf");

        (await _discovery.SearchAsync("   ")).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Search_carries_the_resolved_permissions_on_each_hit()
    {
        await SeedFile("file-1", "report.pdf");

        var item = (await _discovery.SearchAsync("report")).Items.Single();

        item.Permissions.CanView.Should().BeTrue();
        item.Permissions.CanManage.Should().BeTrue("the caller owns it");
    }

    [Fact]
    public async Task Search_pages_and_hands_back_a_cursor()
    {
        for (var i = 0; i < 5; i++)
        {
            await SeedFile($"file-{i}", $"report-{i}.pdf");
        }

        var first = await _discovery.SearchAsync("report", limit: 2);

        first.Items.Should().HaveCount(2);
        first.HasMore.Should().BeTrue();
        first.NextCursor.Should().NotBeNull();

        var second = await _discovery.SearchAsync("report", cursor: first.NextCursor, limit: 2);

        second.Items.Should().HaveCount(2);
        second.Items.Select(i => i.ItemId).Should().NotIntersectWith(first.Items.Select(i => i.ItemId));
    }

    // ---------- Trash ----------

    [Fact]
    public async Task The_trash_lists_only_archived_content()
    {
        await SeedFile("live", "live.pdf");
        await SeedFile("gone", "gone.pdf", archived: true);

        var page = await _discovery.GetTrashAsync();

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("gone");
    }

    [Fact]
    public async Task The_trash_hides_other_peoples_content()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);

        (await _discovery.GetTrashAsync()).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Restoring_returns_a_file_to_the_live_listing()
    {
        await SeedFile("file-1", "report.pdf", archived: true);

        var result = await _discovery.RestoreAsync("file-1");

        result.IsSuccess.Should().BeTrue();
        (await Files.Find(f => f.ItemId == "file-1").FirstAsync()).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task Restoring_a_folder_works_the_same_way()
    {
        await SeedFolder("dir-1", "Reports", archived: true);

        var result = await _discovery.RestoreAsync("dir-1");

        result.IsSuccess.Should().BeTrue();
        (await Directories.Find(d => d.ItemId == "dir-1").FirstAsync()).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task Restoring_something_that_is_not_in_the_trash_reports_not_found()
    {
        await SeedFile("file-1", "report.pdf");

        (await _discovery.RestoreAsync("file-1")).Status.Should().Be(TrashOperationStatus.NotFound);
    }

    [Fact]
    public async Task Restoring_content_the_caller_cannot_delete_is_refused()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);

        var result = await _discovery.RestoreAsync("theirs");

        result.Status.Should().Be(TrashOperationStatus.NotPermitted);
        (await Files.Find(f => f.ItemId == "theirs").FirstAsync()).IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task Emptying_an_item_from_the_trash_also_removes_its_access_entries()
    {
        await SeedFile("file-1", "report.pdf", archived: true);
        await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ContentResourceType.File,
            PrincipalType = ContentPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ContentPermission.View,
            Effect = ContentEffect.Allow,
        });

        var result = await _discovery.DeleteFromTrashAsync("file-1");

        result.IsSuccess.Should().BeTrue();
        (await Files.CountDocumentsAsync(f => f.ItemId == "file-1")).Should().Be(0);
        (await _accessRepository.GetByResourceAsync("file-1")).Should().BeEmpty();
    }

    [Fact]
    public async Task Emptying_content_the_caller_cannot_delete_is_refused()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);

        var result = await _discovery.DeleteFromTrashAsync("theirs");

        result.Status.Should().Be(TrashOperationStatus.NotPermitted);
        (await Files.CountDocumentsAsync(f => f.ItemId == "theirs")).Should().Be(1);
    }

    [Fact]
    public async Task Trash_operations_are_audited()
    {
        await SeedFile("file-1", "report.pdf", archived: true);

        await _discovery.RestoreAsync("file-1");

        var audit = await _accessRepository.GetAuditForResourceAsync("file-1");
        audit.Should().ContainSingle().Which.Action.Should().Be("Restore");
    }
}
