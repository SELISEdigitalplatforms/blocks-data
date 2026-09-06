using Blocks.Genesis;
using DomainService.Storage;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using XUnitTest.Infrastructure;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the directory lifecycle. The cases that matter here are the refusals: creating a
/// subdirectory somewhere the caller cannot write, colliding with a sibling name, and
/// permanently deleting a directory that still holds content. Each of those is a way to
/// either bypass access or lose data, so they are asserted rather than assumed.
/// </summary>
[Collection("Mongo")]
public class DirectoryManagementServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ObjectAccessRepository _accessRepository;
    private readonly FileDirectoryManagementService _directorys;

    public DirectoryManagementServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<FileDirectory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileDirectory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<FileVersion>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileVersion>(n));
        provider.Setup(p => p.GetCollection<ObjectAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ObjectAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ObjectAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ObjectAuditLog>(n));

        _accessRepository = new ObjectAccessRepository(provider.Object);

        // The real FileManagementService has heavy storage-provider dependencies; for the
        // directory cascade tests we only need DeleteFileAsync to remove the File + its
        // versions from the test database so the post-cascade assertions hold.
        var fileRepo = new FileRepository(provider.Object);
        var versionRepo = new FileVersionRepository(provider.Object);
        var fileManagementMock = new Mock<IFileManagementService>();
        fileManagementMock
            .Setup(f => f.DeleteFileForDirectoryCascadeAsync(It.IsAny<DeleteFileRequest>()))
            .ReturnsAsync((DeleteFileRequest req) =>
            {
                var file = fileRepo.GetFileByItemIdAsync(req.FileId).GetAwaiter().GetResult();
                if (file is null) return new BaseResponse { IsSuccess = true };
                versionRepo.DeleteFileVersionsAsync(file.ItemId).GetAwaiter().GetResult();
                fileRepo.DeleteFileAsync(file).GetAwaiter().GetResult();
                return new BaseResponse { IsSuccess = true };
            });

        _directorys = new FileDirectoryManagementService(
            provider.Object, new ObjectAccessResolver(_accessRepository), _accessRepository, fileManagementMock.Object);

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1", organizationId: "org-1", roles: new[] { "editor" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private IMongoCollection<FileDirectory> Directories => _db.GetCollection<FileDirectory>("FileDirectories");
    private IMongoCollection<File> Files => _db.GetCollection<File>("Files");

    private Task SeedDirectory(
        string id, string? parentId = null, string createdBy = "user-1",
        bool inherits = true, bool archived = false, string? name = null,
        List<string>? ancestorIds = null)
        => Directories.InsertOneAsync(new FileDirectory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name ?? id,
            SystemName = (name ?? id).ToLowerInvariant(),
            Type = StructureType.Directory,
            ParentId = parentId,
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
            DirectoryId = parentId,
            AncestorIds = new List<string> { parentId },
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private Task<FileDirectory> Load(string id) =>
        Directories.Find(d => d.ItemId == id).FirstOrDefaultAsync();

    // Resources with no policy are public. Seed a policy for another principal when a
    // test needs a resource the current caller cannot access.
    private Task RestrictToAnotherUser(string resourceId) =>
        _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = resourceId,
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ObjectPermission.Owner,
            Effect = ObjectEffect.Allow,
        });

    // ---------- Create ----------

    [Fact]
    public async Task A_root_directory_is_created_with_no_ancestry()
    {
        var result = await _directorys.CreateDirectoryAsync("Reports", null);

        result.IsSuccess.Should().BeTrue();
        var stored = await Load(result.DirectoryId!);
        stored.AncestorIds.Should().BeEmpty();
        stored.ParentId.Should().BeNull();
        stored.FullPath.Should().Be("/Reports");
        stored.CreatedBy.Should().Be("user-1");
        stored.OrganizationId.Should().Be("org-1");
        stored.LastUpdatedDate.Should().Be(stored.CreatedDate);
        stored.LastUpdatedBy.Should().Be(stored.CreatedBy);
    }

    [Fact]
    public async Task A_nested_directory_inherits_the_parent_ancestry_and_path()
    {
        await SeedDirectory("root", name: "Root");
        await SeedDirectory("mid", parentId: "root", name: "Mid", ancestorIds: new List<string> { "root" });
        await Directories.UpdateOneAsync(
            d => d.ItemId == "mid", Builders<FileDirectory>.Update.Set(d => d.FullPath, "/Root/Mid"));

        var result = await _directorys.CreateDirectoryAsync("Leaf", "mid");

        result.IsSuccess.Should().BeTrue();
        var stored = await Load(result.DirectoryId!);
        stored.AncestorIds.Should().Equal("root", "mid");
        stored.FullPath.Should().Be("/Root/Mid/Leaf");
    }

    [Fact]
    public async Task Creating_under_a_parent_the_caller_cannot_edit_is_refused()
    {
        // Owned by somebody else and restricted to a different user, so Edit does not resolve.
        await SeedDirectory("root", createdBy: "someone-else");
        await RestrictToAnotherUser("root");

        var result = await _directorys.CreateDirectoryAsync("Leaf", "root");

        result.Status.Should().Be(DirectoryOperationStatus.NotPermitted);
        (await Directories.CountDocumentsAsync(d => d.Name == "Leaf")).Should().Be(0);
    }

    [Fact]
    public async Task Creating_under_a_missing_parent_reports_the_parent_not_the_directory()
    {
        var result = await _directorys.CreateDirectoryAsync("Leaf", "no-such-directory");

        result.Status.Should().Be(DirectoryOperationStatus.ParentNotFound);
    }

    [Fact]
    public async Task A_duplicate_sibling_name_is_refused_regardless_of_casing()
    {
        // The stored key is the lowercased name, so "REPORTS" and "Reports" collide. This
        // is the case that breaks if the uniqueness key and the stored value ever diverge.
        await _directorys.CreateDirectoryAsync("Reports", null);

        var result = await _directorys.CreateDirectoryAsync("REPORTS", null);

        result.Status.Should().Be(DirectoryOperationStatus.NameConflict);
        (await Directories.CountDocumentsAsync(d => d.ParentId == null)).Should().Be(1);
    }

    [Fact]
    public async Task A_name_reused_under_a_different_parent_is_allowed()
    {
        await SeedDirectory("root");
        await _directorys.CreateDirectoryAsync("Reports", null);

        var result = await _directorys.CreateDirectoryAsync("Reports", "root");

        result.IsSuccess.Should().BeTrue("uniqueness is scoped to the parent, not the tenant");
    }

    [Fact]
    public async Task Creating_a_subdirectory_bumps_the_parents_directory_count()
    {
        await SeedDirectory("root");

        await _directorys.CreateDirectoryAsync("Leaf", "root");

        (await Load("root")).ChildDirectoryCount.Should().Be(1);
    }

    [Fact]
    public async Task Creating_a_directory_is_audited()
    {
        var result = await _directorys.CreateDirectoryAsync("Reports", null);

        var audit = await _accessRepository.GetAuditForResourceAsync(result.DirectoryId!);
        audit.Should().ContainSingle().Which.Granted.Should().BeTrue();
    }

    // ---------- Get ----------

    [Fact]
    public async Task Reading_an_owned_directory_returns_it_with_full_permissions()
    {
        await SeedDirectory("dir-1");

        var result = await _directorys.GetDirectoryAsync("dir-1");

        result.IsSuccess.Should().BeTrue();
        result.Directory!.ItemId.Should().Be("dir-1");
        result.Permissions!.CanManage.Should().BeTrue();
    }

    [Fact]
    public async Task A_directory_the_caller_cannot_view_reports_not_found_rather_than_forbidden()
    {
        // Saying "forbidden" would confirm the directory exists, which is enough to map a
        // tree the caller has no access to.
        await SeedDirectory("dir-1", createdBy: "someone-else");
        await RestrictToAnotherUser("dir-1");

        var result = await _directorys.GetDirectoryAsync("dir-1");

        result.Status.Should().Be(DirectoryOperationStatus.NotFound);
        result.Status.Should().NotBe(DirectoryOperationStatus.NotPermitted);
    }

    [Fact]
    public async Task A_missing_directory_reports_not_found()
    {
        (await _directorys.GetDirectoryAsync("nope")).Status.Should().Be(DirectoryOperationStatus.NotFound);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Renaming_updates_the_name_the_lookup_key_and_the_path_leaf()
    {
        await SeedDirectory("dir-1", name: "Old");
        await Directories.UpdateOneAsync(
            d => d.ItemId == "dir-1", Builders<FileDirectory>.Update.Set(d => d.FullPath, "/Root/Old"));

        var result = await _directorys.UpdateDirectoryAsync("dir-1", "New", null);

        result.IsSuccess.Should().BeTrue();
        var stored = await Load("dir-1");
        stored.Name.Should().Be("New");
        stored.SystemName.Should().Be("new");
        stored.FullPath.Should().Be("/Root/New");
    }

    [Fact]
    public async Task Renaming_onto_an_existing_sibling_is_refused()
    {
        await SeedDirectory("a", name: "Alpha");
        await SeedDirectory("b", name: "Beta");

        var result = await _directorys.UpdateDirectoryAsync("b", "Alpha", null);

        result.Status.Should().Be(DirectoryOperationStatus.NameConflict);
        (await Load("b")).Name.Should().Be("Beta");
    }

    [Fact]
    public async Task Renaming_a_default_directory_is_refused()
    {
        // Default directories carry a "default" tag (set by the seed-template consumer);
        // their name is part of the tenant contract and cannot be changed.
        await SeedDirectory("cloud", name: "Cloud");
        await Directories.UpdateOneAsync(
            d => d.ItemId == "cloud", Builders<FileDirectory>.Update.Set(d => d.Tags, new List<string> { "default" }));

        var result = await _directorys.UpdateDirectoryAsync("cloud", "Cloudy", null);

        result.Status.Should().Be(DirectoryOperationStatus.IsDefault);
        (await Load("cloud")).Name.Should().Be("Cloud");
    }

    [Fact]
    public async Task Deleting_a_default_directory_is_refused()
    {
        await SeedDirectory("cloud", name: "Cloud");
        await Directories.UpdateOneAsync(
            d => d.ItemId == "cloud", Builders<FileDirectory>.Update.Set(d => d.Tags, new List<string> { "default" }));

        var result = await _directorys.DeleteDirectoryAsync("cloud", permanent: true);

        result.Status.Should().Be(DirectoryOperationStatus.IsDefault);
        (await Load("cloud")).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task Renaming_a_directory_to_its_own_name_is_not_a_conflict()
    {
        await SeedDirectory("a", name: "Alpha");

        var result = await _directorys.UpdateDirectoryAsync("a", "Alpha", null);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task A_description_can_be_set_without_touching_the_name()
    {
        await SeedDirectory("dir-1", name: "Alpha");

        await _directorys.UpdateDirectoryAsync("dir-1", null, "quarterly numbers");

        var stored = await Load("dir-1");
        stored.Description.Should().Be("quarterly numbers");
        stored.Name.Should().Be("Alpha");
    }

    [Fact]
    public async Task Updating_a_directory_the_caller_cannot_edit_is_refused()
    {
        await SeedDirectory("dir-1", createdBy: "someone-else");
        await RestrictToAnotherUser("dir-1");

        var result = await _directorys.UpdateDirectoryAsync("dir-1", "New", null);

        result.Status.Should().Be(DirectoryOperationStatus.NotPermitted);
    }

    // ---------- Delete ----------

    [Fact]
    public async Task A_soft_delete_archives_the_directory_and_keeps_it_recoverable()
    {
        await SeedDirectory("dir-1");

        // Permanent is the default now, so soft delete must be asked for explicitly.
        var result = await _directorys.DeleteDirectoryAsync("dir-1", permanent: false);

        result.IsSuccess.Should().BeTrue();
        (await Load("dir-1")).IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task A_soft_delete_and_restore_apply_to_every_descendant()
    {
        await SeedDirectory("root");
        await SeedDirectory("child", parentId: "root", ancestorIds: new List<string> { "root" });
        await SeedFile("root-file", "root");
        await SeedFile("child-file", "child");

        (await _directorys.DeleteDirectoryAsync("root", permanent: false)).IsSuccess.Should().BeTrue();
        (await Load("root")).IsArchived.Should().BeTrue();
        (await Load("child")).IsArchived.Should().BeTrue();
        (await Files.Find(f => f.ItemId == "root-file").FirstAsync()).IsArchived.Should().BeTrue();
        (await Files.Find(f => f.ItemId == "child-file").FirstAsync()).IsArchived.Should().BeTrue();

        (await _directorys.RestoreDirectoryAsync("root")).IsSuccess.Should().BeTrue();
        (await Load("root")).IsArchived.Should().BeFalse();
        (await Load("child")).IsArchived.Should().BeFalse();
        (await Files.Find(f => f.ItemId == "root-file").FirstAsync()).IsArchived.Should().BeFalse();
        (await Files.Find(f => f.ItemId == "child-file").FirstAsync()).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task A_permanent_delete_cascades_to_files_inside_the_directory()
    {
        await SeedDirectory("dir-1", archived: true);
        await SeedFile("file-1", "dir-1");

        var result = await _directorys.DeleteDirectoryAsync("dir-1", permanent: true);

        result.IsSuccess.Should().BeTrue();
        (await Directories.CountDocumentsAsync(d => d.ItemId == "dir-1")).Should().Be(0);
        (await Files.CountDocumentsAsync(f => f.ItemId == "file-1")).Should().Be(0);
    }

    [Fact]
    public async Task A_permanent_delete_cascades_to_nested_subdirectories_and_their_files()
    {
        await SeedDirectory("dir-1", archived: true);
        await SeedDirectory("child", parentId: "dir-1", ancestorIds: new List<string> { "dir-1" });
        await SeedFile("file-1", "child");

        var result = await _directorys.DeleteDirectoryAsync("dir-1", permanent: true);

        result.IsSuccess.Should().BeTrue();
        (await Directories.CountDocumentsAsync(d => d.ItemId == "dir-1" || d.ItemId == "child")).Should().Be(0);
        (await Files.CountDocumentsAsync(f => f.ItemId == "file-1")).Should().Be(0);
    }

    [Fact]
    public async Task A_permanent_delete_of_an_empty_directory_removes_it_and_its_access_entries()
    {
        await SeedDirectory("dir-1", archived: true);
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });

        var result = await _directorys.DeleteDirectoryAsync("dir-1", permanent: true);

        result.IsSuccess.Should().BeTrue();
        (await Directories.CountDocumentsAsync(d => d.ItemId == "dir-1")).Should().Be(0);
        (await _accessRepository.GetByResourceAsync("dir-1")).Should().BeEmpty(
            "a deleted resource must not leave entries that a recreated id would inherit");
    }

    [Fact]
    public async Task Deleting_a_directory_the_caller_cannot_delete_is_refused()
    {
        await SeedDirectory("dir-1", createdBy: "someone-else");
        await RestrictToAnotherUser("dir-1");

        var result = await _directorys.DeleteDirectoryAsync("dir-1");

        result.Status.Should().Be(DirectoryOperationStatus.NotPermitted);
        (await Load("dir-1")).IsArchived.Should().BeFalse();
    }

    [Fact]
    public async Task Deleting_a_subdirectory_decrements_the_parents_directory_count()
    {
        await SeedDirectory("root");
        var created = await _directorys.CreateDirectoryAsync("Leaf", "root");
        (await Load("root")).ChildDirectoryCount.Should().Be(1);

        await _directorys.DeleteDirectoryAsync(created.DirectoryId!);

        (await Load("root")).ChildDirectoryCount.Should().Be(0);
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
        FileDirectoryManagementService.BuildPath(parentPath, name).Should().Be(expected);
    }

    [Theory]
    [InlineData("/Root/Old", "New", "/Root/New")]
    [InlineData("/Old", "New", "/New")]
    [InlineData(null, "New", "/New")]
    public void A_rename_replaces_only_the_last_path_segment(string? fullPath, string newName, string expected)
    {
        FileDirectoryManagementService.RenameLeaf(fullPath, newName).Should().Be(expected);
    }
}
