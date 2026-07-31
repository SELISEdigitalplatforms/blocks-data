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
/// Covers the folder lifecycle. The cases that matter here are the refusals: creating a
/// subfolder somewhere the caller cannot write, colliding with a sibling name, and
/// permanently deleting a folder that still holds content. Each of those is a way to
/// either bypass access or lose data, so they are asserted rather than assumed.
/// </summary>
[Collection("Mongo")]
public class FolderManagementServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _accessRepository;
    private readonly FolderManagementService _folders;

    public FolderManagementServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<Directory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<Directory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAuditLog>(n));

        _accessRepository = new ContentAccessRepository(provider.Object);
        _folders = new FolderManagementService(
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
        string id, string? parentId = null, string createdBy = "user-1",
        bool inherits = true, bool archived = false, string? name = null,
        List<string>? ancestorIds = null)
        => Directories.InsertOneAsync(new Directory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name ?? id,
            SystemName = (name ?? id).ToLowerInvariant(),
            Type = StructureType.Directory,
            ParentDirectoryID = parentId,
            AncestorIds = ancestorIds ?? new List<string>(),
            InheritsParentAccess = inherits,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private Task SeedFile(string id, string parentId, string createdBy = "user-1")
        => Files.InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = id,
            Type = StructureType.File,
            ParentDirectoryID = parentId,
            AncestorIds = new List<string> { parentId },
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private Task<Directory> Load(string id) =>
        Directories.Find(d => d.ItemId == id).FirstOrDefaultAsync();

    // ---------- Create ----------

    [Fact]
    public async Task A_root_folder_is_created_with_no_ancestry()
    {
        var result = await _folders.CreateFolderAsync("Reports", null);

        result.IsSuccess.Should().BeTrue();
        var stored = await Load(result.FolderId!);
        stored.AncestorIds.Should().BeEmpty();
        stored.ParentDirectoryID.Should().BeNull();
        stored.FullPath.Should().Be("/Reports");
        stored.CreatedBy.Should().Be("user-1");
    }

    [Fact]
    public async Task A_nested_folder_inherits_the_parent_ancestry_and_path()
    {
        await SeedFolder("root", name: "Root");
        await SeedFolder("mid", parentId: "root", name: "Mid", ancestorIds: new List<string> { "root" });
        await Directories.UpdateOneAsync(
            d => d.ItemId == "mid", Builders<Directory>.Update.Set(d => d.FullPath, "/Root/Mid"));

        var result = await _folders.CreateFolderAsync("Leaf", "mid");

        result.IsSuccess.Should().BeTrue();
        var stored = await Load(result.FolderId!);
        stored.AncestorIds.Should().Equal("root", "mid");
        stored.FullPath.Should().Be("/Root/Mid/Leaf");
    }

    [Fact]
    public async Task Creating_under_a_parent_the_caller_cannot_edit_is_refused()
    {
        // Owned by somebody else and carrying no grant, so Edit does not resolve.
        await SeedFolder("root", createdBy: "someone-else");

        var result = await _folders.CreateFolderAsync("Leaf", "root");

        result.Status.Should().Be(FolderOperationStatus.NotPermitted);
        (await Directories.CountDocumentsAsync(d => d.Name == "Leaf")).Should().Be(0);
    }

    [Fact]
    public async Task Creating_under_a_missing_parent_reports_the_parent_not_the_folder()
    {
        var result = await _folders.CreateFolderAsync("Leaf", "no-such-folder");

        result.Status.Should().Be(FolderOperationStatus.ParentNotFound);
    }

    [Fact]
    public async Task A_duplicate_sibling_name_is_refused_regardless_of_casing()
    {
        // The stored key is the lowercased name, so "REPORTS" and "Reports" collide. This
        // is the case that breaks if the uniqueness key and the stored value ever diverge.
        await _folders.CreateFolderAsync("Reports", null);

        var result = await _folders.CreateFolderAsync("REPORTS", null);

        result.Status.Should().Be(FolderOperationStatus.NameConflict);
        (await Directories.CountDocumentsAsync(d => d.ParentDirectoryID == null)).Should().Be(1);
    }

    [Fact]
    public async Task A_name_reused_under_a_different_parent_is_allowed()
    {
        await SeedFolder("root");
        await _folders.CreateFolderAsync("Reports", null);

        var result = await _folders.CreateFolderAsync("Reports", "root");

        result.IsSuccess.Should().BeTrue("uniqueness is scoped to the parent, not the tenant");
    }

    [Fact]
    public async Task Creating_a_subfolder_bumps_the_parents_folder_count()
    {
        await SeedFolder("root");

        await _folders.CreateFolderAsync("Leaf", "root");

        (await Load("root")).ChildFolderCount.Should().Be(1);
    }

    [Fact]
    public async Task Creating_a_folder_is_audited()
    {
        var result = await _folders.CreateFolderAsync("Reports", null);

        var audit = await _accessRepository.GetAuditForResourceAsync(result.FolderId!);
        audit.Should().ContainSingle().Which.Granted.Should().BeTrue();
    }

    // ---------- Get ----------

    [Fact]
    public async Task Reading_an_owned_folder_returns_it_with_full_permissions()
    {
        await SeedFolder("dir-1");

        var result = await _folders.GetFolderAsync("dir-1");

        result.IsSuccess.Should().BeTrue();
        result.Folder!.ItemId.Should().Be("dir-1");
        result.Permissions!.CanManage.Should().BeTrue();
    }

    [Fact]
    public async Task A_folder_the_caller_cannot_view_reports_not_found_rather_than_forbidden()
    {
        // Saying "forbidden" would confirm the folder exists, which is enough to map a
        // tree the caller has no access to.
        await SeedFolder("dir-1", createdBy: "someone-else");

        var result = await _folders.GetFolderAsync("dir-1");

        result.Status.Should().Be(FolderOperationStatus.NotFound);
        result.Status.Should().NotBe(FolderOperationStatus.NotPermitted);
    }

    [Fact]
    public async Task A_missing_folder_reports_not_found()
    {
        (await _folders.GetFolderAsync("nope")).Status.Should().Be(FolderOperationStatus.NotFound);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Renaming_updates_the_name_the_lookup_key_and_the_path_leaf()
    {
        await SeedFolder("dir-1", name: "Old");
        await Directories.UpdateOneAsync(
            d => d.ItemId == "dir-1", Builders<Directory>.Update.Set(d => d.FullPath, "/Root/Old"));

        var result = await _folders.UpdateFolderAsync("dir-1", "New", null);

        result.IsSuccess.Should().BeTrue();
        var stored = await Load("dir-1");
        stored.Name.Should().Be("New");
        stored.SystemName.Should().Be("new");
        stored.FullPath.Should().Be("/Root/New");
    }

    [Fact]
    public async Task Renaming_onto_an_existing_sibling_is_refused()
    {
        await SeedFolder("a", name: "Alpha");
        await SeedFolder("b", name: "Beta");

        var result = await _folders.UpdateFolderAsync("b", "Alpha", null);

        result.Status.Should().Be(FolderOperationStatus.NameConflict);
        (await Load("b")).Name.Should().Be("Beta");
    }

    [Fact]
    public async Task Renaming_a_folder_to_its_own_name_is_not_a_conflict()
    {
        await SeedFolder("a", name: "Alpha");

        var result = await _folders.UpdateFolderAsync("a", "Alpha", null);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task A_description_can_be_set_without_touching_the_name()
    {
        await SeedFolder("dir-1", name: "Alpha");

        await _folders.UpdateFolderAsync("dir-1", null, "quarterly numbers");

        var stored = await Load("dir-1");
        stored.Description.Should().Be("quarterly numbers");
        stored.Name.Should().Be("Alpha");
    }

    [Fact]
    public async Task Updating_a_folder_the_caller_cannot_edit_is_refused()
    {
        await SeedFolder("dir-1", createdBy: "someone-else");

        var result = await _folders.UpdateFolderAsync("dir-1", "New", null);

        result.Status.Should().Be(FolderOperationStatus.NotPermitted);
    }

    // ---------- Delete ----------

    [Fact]
    public async Task A_soft_delete_archives_the_folder_and_keeps_it_recoverable()
    {
        await SeedFolder("dir-1");

        var result = await _folders.DeleteFolderAsync("dir-1");

        result.IsSuccess.Should().BeTrue();
        (await Load("dir-1")).IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task A_permanent_delete_of_a_folder_holding_files_is_refused()
    {
        // Refusing rather than cascading is what stops a subtree disappearing behind one
        // request. The caller empties it first, or the trash keeps it.
        await SeedFolder("dir-1", archived: true);
        await SeedFile("file-1", "dir-1");

        var result = await _folders.DeleteFolderAsync("dir-1", permanent: true);

        result.Status.Should().Be(FolderOperationStatus.NotEmpty);
        (await Directories.CountDocumentsAsync(d => d.ItemId == "dir-1")).Should().Be(1);
    }

    [Fact]
    public async Task A_permanent_delete_of_a_folder_holding_subfolders_is_refused()
    {
        await SeedFolder("dir-1", archived: true);
        await SeedFolder("child", parentId: "dir-1");

        var result = await _folders.DeleteFolderAsync("dir-1", permanent: true);

        result.Status.Should().Be(FolderOperationStatus.NotEmpty);
    }

    [Fact]
    public async Task A_permanent_delete_of_an_empty_folder_removes_it_and_its_access_entries()
    {
        await SeedFolder("dir-1", archived: true);
        await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "dir-1",
            ResourceType = ContentResourceType.Folder,
            PrincipalType = ContentPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ContentPermission.View,
            Effect = ContentEffect.Allow,
        });

        var result = await _folders.DeleteFolderAsync("dir-1", permanent: true);

        result.IsSuccess.Should().BeTrue();
        (await Directories.CountDocumentsAsync(d => d.ItemId == "dir-1")).Should().Be(0);
        (await _accessRepository.GetByResourceAsync("dir-1")).Should().BeEmpty(
            "a deleted resource must not leave entries that a recreated id would inherit");
    }

    [Fact]
    public async Task Deleting_a_folder_the_caller_cannot_delete_is_refused()
    {
        await SeedFolder("dir-1", createdBy: "someone-else");

        var result = await _folders.DeleteFolderAsync("dir-1");

        result.Status.Should().Be(FolderOperationStatus.NotPermitted);
        (await Load("dir-1")).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task Deleting_a_subfolder_decrements_the_parents_folder_count()
    {
        await SeedFolder("root");
        var created = await _folders.CreateFolderAsync("Leaf", "root");
        (await Load("root")).ChildFolderCount.Should().Be(1);

        await _folders.DeleteFolderAsync(created.FolderId!);

        (await Load("root")).ChildFolderCount.Should().Be(0);
    }

    // ---------- Path helpers ----------

    [Theory]
    [InlineData(null, "Root", "/Root")]
    [InlineData("", "Root", "/Root")]
    [InlineData("/Root", "Sub", "/Root/Sub")]
    [InlineData("/Root/", "Sub", "/Root/Sub")]
    public void A_path_is_built_from_the_parent_without_doubling_separators(
        string? parentPath, string name, string expected)
    {
        FolderManagementService.BuildPath(parentPath, name).Should().Be(expected);
    }

    [Theory]
    [InlineData("/Root/Old", "New", "/Root/New")]
    [InlineData("/Old", "New", "/New")]
    [InlineData(null, "New", "/New")]
    public void A_rename_replaces_only_the_last_path_segment(string? fullPath, string newName, string expected)
    {
        FolderManagementService.RenameLeaf(fullPath, newName).Should().Be(expected);
    }
}
