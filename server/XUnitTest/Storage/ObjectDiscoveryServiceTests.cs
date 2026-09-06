using Blocks.Genesis;
using DomainService.Storage;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Covers search and the trash. Both are reads that cross the whole tenant rather than
/// one directory, so the case that matters most is that a match the caller may not view
/// never reaches them: a search that leaked names would be a directory listing of
/// everything, which is exactly what the access model exists to prevent.
/// </summary>
[Collection("Mongo")]
public class ObjectDiscoveryServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ObjectAccessRepository _accessRepository;
    private readonly ObjectItemRepository _objectItems;
    private readonly Mock<IFileManagementService> _fileManagement = new();
    private readonly ObjectDiscoveryService _discovery;

    public ObjectDiscoveryServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<FileDirectory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileDirectory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<ObjectAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ObjectAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ObjectAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ObjectAuditLog>(n));
        provider.Setup(p => p.GetCollection<ObjectItem>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ObjectItem>(n));

        _accessRepository = new ObjectAccessRepository(provider.Object);
        _objectItems = new ObjectItemRepository(provider.Object);
        _fileManagement
            .Setup(f => f.DeleteFileAsync(It.IsAny<DeleteFileRequest>()))
            .ReturnsAsync((DeleteFileRequest request) =>
            {
                Files.DeleteOneAsync(f => f.ItemId == request.FileId).GetAwaiter().GetResult();
                _accessRepository.RevokeAllForResourceAsync(request.FileId).GetAwaiter().GetResult();
                return new BaseResponse { IsSuccess = true };
            });
        _fileManagement
            .Setup(f => f.DeleteFileForDirectoryCascadeAsync(It.IsAny<DeleteFileRequest>()))
            .ReturnsAsync((DeleteFileRequest request) =>
            {
                Files.DeleteOneAsync(f => f.ItemId == request.FileId).GetAwaiter().GetResult();
                _accessRepository.RevokeAllForResourceAsync(request.FileId).GetAwaiter().GetResult();
                return new BaseResponse { IsSuccess = true };
            });
        var resolver = new ObjectAccessResolver(_accessRepository);
        var directoryManagement = new FileDirectoryManagementService(
            provider.Object, resolver, _accessRepository, _fileManagement.Object);
        _discovery = new ObjectDiscoveryService(
            provider.Object, resolver, _accessRepository, _fileManagement.Object, directoryManagement, _objectItems);

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1", organizationId: "org-1", roles: new[] { "editor" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private IMongoCollection<FileDirectory> Directories => _db.GetCollection<FileDirectory>("FileDirectories");
    private IMongoCollection<File> Files => _db.GetCollection<File>("Files");

    private async Task SeedDirectory(
        string id, string name, string createdBy = "user-1", bool archived = false,
        List<string>? ancestorIds = null, string organizationId = "org-1")
    {
        var directory = new FileDirectory
        {
            ItemId = id,
            TenantId = "tenant-1",
            OrganizationId = organizationId,
            Name = name,
            SystemName = name.ToLowerInvariant(),
            Type = StructureType.Directory,
            AncestorIds = ancestorIds ?? new List<string>(),
            InheritsParentAccess = true,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        };
        await Directories.InsertOneAsync(directory);
        var item = ObjectItem.From(directory);
        item.OrganizationId = organizationId;
        await _objectItems.UpsertAsync(item);
    }

    private async Task SeedFile(
        string id, string name, string createdBy = "user-1", bool archived = false,
        List<string>? ancestorIds = null, string organizationId = "org-1")
    {
        var file = new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            OrganizationId = organizationId,
            Name = name,
            Type = StructureType.File,
            AncestorIds = ancestorIds ?? new List<string>(),
            InheritsParentAccess = true,
            IsArchived = archived,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        };
        await Files.InsertOneAsync(file);
        var item = ObjectItem.From(file);
        item.OrganizationId = organizationId;
        await _objectItems.UpsertAsync(item);
    }

    // ---------- Search ----------

    [Fact]
    public async Task Search_returns_only_objects_in_the_callers_organization()
    {
        await SeedFile("org-1-file", "report-one.pdf");
        await SeedFile("org-2-file", "report-two.pdf", organizationId: "org-2");

        var page = await _discovery.SearchAsync("report");

        page.Items.Select(item => item.ItemId).Should().Equal("org-1-file");
    }

    [Fact]
    public async Task Get_objects_returns_only_objects_in_the_callers_organization()
    {
        await SeedFile("org-1-file", "one.pdf");
        await SeedFile("org-2-file", "two.pdf", organizationId: "org-2");

        var page = await _discovery.GetObjectAsync(null);

        page.Items.Select(item => item.ItemId).Should().Equal("org-1-file");
    }

    [Fact]
    public async Task Trash_returns_only_objects_in_the_callers_organization()
    {
        await SeedFile("org-1-file", "one.pdf", archived: true);
        await SeedFile("org-2-file", "two.pdf", archived: true, organizationId: "org-2");

        var page = await _discovery.GetTrashAsync();

        page.Items.Select(item => item.ItemId).Should().Equal("org-1-file");
    }

    [Fact]
    public async Task Search_does_not_apply_an_organization_filter_while_impersonating()
    {
        await SeedFile("org-1-file", "report-one.pdf");
        await SeedFile("org-2-file", "report-two.pdf", organizationId: "org-2");
        BlocksContext.SetContext(BlocksContext.Create(
            tenantId: "tenant-1", roles: new[] { "editor" }, userId: "user-1",
            isAuthenticated: true, requestUri: "/graphql", organizationId: "org-1",
            expireOn: DateTime.UtcNow.AddHours(1), email: "user@example.com",
            permissions: Array.Empty<string>(), userName: "user", phoneNumber: "",
            displayName: "User", oauthToken: "", originalTenantId: "tenant-1",
            impersonated: true));

        var page = await _discovery.SearchAsync("report");

        page.Items.Select(item => item.ItemId)
            .Should().BeEquivalentTo("org-1-file", "org-2-file");
    }

    [Fact]
    public async Task Search_matches_a_substring_of_the_name()
    {
        await SeedDirectory("dir-1", "Quarterly Reports");
        await SeedFile("file-1", "budget.xlsx");

        var page = await _discovery.SearchAsync("report");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("dir-1");
    }

    [Fact]
    public async Task Search_ignores_case()
    {
        await SeedDirectory("dir-1", "Quarterly Reports");

        (await _discovery.SearchAsync("QUARTERLY")).Items.Should().ContainSingle();
    }

    [Fact]
    public async Task Search_returns_both_directorys_and_files()
    {
        await SeedDirectory("dir-1", "report archive");
        await SeedFile("file-1", "report.pdf");

        var page = await _discovery.SearchAsync("report");

        page.Items.Should().HaveCount(2);
        page.Items.Select(i => i.Type).Should().Contain(new[] { StructureType.Directory, StructureType.File });
    }

    [Fact]
    public async Task Search_can_be_narrowed_to_one_kind()
    {
        await SeedDirectory("dir-1", "report archive");
        await SeedFile("file-1", "report.pdf");

        var directorys = await _discovery.SearchAsync("report", type: StructureType.Directory);
        var files = await _discovery.SearchAsync("report", type: StructureType.File);

        directorys.Items.Should().ContainSingle().Which.ItemId.Should().Be("dir-1");
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
        await SeedDirectory("root", "Root");
        await SeedFile("inside", "report-inside.pdf", ancestorIds: new List<string> { "root" });
        await SeedFile("outside", "report-outside.pdf");

        var page = await _discovery.SearchAsync("report", directoryId: "root");

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("inside");
    }

    [Fact]
    public async Task Search_skips_archived_objects()
    {
        await SeedFile("file-1", "report.pdf", archived: true);

        (await _discovery.SearchAsync("report")).Items.Should().BeEmpty(
            "trashed objects are found through the trash, not through search");
    }

    [Fact]
    public async Task Search_returns_unrestricted_objects_to_everyone()
    {
        await SeedFile("mine", "report-mine.pdf");
        await SeedFile("theirs", "report-theirs.pdf", createdBy: "someone-else");

        var page = await _discovery.SearchAsync("report");

        page.Items.Select(item => item.ItemId).Should().BeEquivalentTo("mine", "theirs");
    }

    [Fact]
    public async Task Search_finds_another_users_object_once_it_is_shared()
    {
        await SeedFile("theirs", "report-theirs.pdf", createdBy: "someone-else");
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "theirs",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-1",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });

        (await _discovery.SearchAsync("report")).Items.Should().ContainSingle();
    }

    // ---------- Shared objects ----------

    [Fact]
    public async Task Shared_objects_include_user_role_and_organization_grants_but_not_unrestricted_objects()
    {
        await SeedFile("user-share", "user.pdf", createdBy: "someone-else");
        await SeedFile("role-share", "role.pdf", createdBy: "someone-else");
        await SeedFile("org-share", "org.pdf", createdBy: "someone-else");
        await SeedFile("public", "public.pdf", createdBy: "someone-else");
        await SeedFile("own-share", "own.pdf");

        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "user-policy",
            TenantId = "tenant-1",
            ResourceId = "user-share",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-1",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "role-policy",
            TenantId = "tenant-1",
            ResourceId = "role-share",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.Role,
            PrincipalId = "editor",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "org-policy",
            TenantId = "tenant-1",
            ResourceId = "org-share",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.Organization,
            PrincipalId = "org-1",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "own-policy",
            TenantId = "tenant-1",
            ResourceId = "own-share",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-1",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });

        var page = await _discovery.GetSharedAsync();

        page.Items.Select(item => item.ItemId).Should().BeEquivalentTo("user-share", "role-share", "org-share");
        page.Items.Should().OnlyContain(item => item.Permissions.CanView);
    }

    [Fact]
    public async Task Shared_objects_include_a_role_share_only_in_its_scoped_organization()
    {
        await SeedFile("matching-role-org", "matching.pdf", createdBy: "someone-else");
        await SeedFile("other-role-org", "other.pdf", createdBy: "someone-else");

        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "matching-policy", TenantId = "tenant-1",
            ResourceId = "matching-role-org", ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.Role, PrincipalId = "editor",
            OrganizationId = "org-1", Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "other-policy", TenantId = "tenant-1",
            ResourceId = "other-role-org", ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.Role, PrincipalId = "editor",
            OrganizationId = "org-2", Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });

        var page = await _discovery.GetSharedAsync();

        page.Items.Select(item => item.ItemId).Should().Equal("matching-role-org");
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
    public async Task The_trash_lists_only_archived_objects()
    {
        await SeedFile("live", "live.pdf");
        await SeedFile("gone", "gone.pdf", archived: true);

        var page = await _discovery.GetTrashAsync();

        page.Items.Should().ContainSingle().Which.ItemId.Should().Be("gone");
    }

    [Fact]
    public async Task The_trash_hides_other_peoples_objects()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);
        await GrantViewToAnotherUserAsync("theirs");

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
    public async Task Restoring_a_directory_works_the_same_way()
    {
        await SeedDirectory("dir-1", "Reports", archived: true);

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
    public async Task Restoring_an_object_the_caller_cannot_delete_is_refused()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);
        await GrantViewToAnotherUserAsync("theirs");

        var result = await _discovery.RestoreAsync("theirs");

        result.Status.Should().Be(TrashOperationStatus.NotPermitted);
        (await Files.Find(f => f.ItemId == "theirs").FirstAsync()).IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task Emptying_an_item_from_the_trash_also_removes_its_access_entries()
    {
        await SeedFile("file-1", "report.pdf", archived: true);
        await _accessRepository.GrantAsync(new ObjectAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ObjectResourceType.File,
            PrincipalType = ObjectPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ObjectPermission.View,
            Effect = ObjectEffect.Allow,
        });

        var result = await _discovery.DeleteFromTrashAsync("file-1");

        result.IsSuccess.Should().BeTrue();
        (await Files.CountDocumentsAsync(f => f.ItemId == "file-1")).Should().Be(0);
        (await _accessRepository.GetByResourceAsync("file-1")).Should().BeEmpty();
        _fileManagement.Verify(f => f.DeleteFileAsync(It.Is<DeleteFileRequest>(request =>
            request.FileId == "file-1" && request.Permanent)), Times.Once);
    }

    [Fact]
    public async Task Emptying_an_object_the_caller_cannot_delete_is_refused()
    {
        await SeedFile("theirs", "theirs.pdf", createdBy: "someone-else", archived: true);
        await GrantViewToAnotherUserAsync("theirs");

        var result = await _discovery.DeleteFromTrashAsync("theirs");

        result.Status.Should().Be(TrashOperationStatus.NotPermitted);
        (await Files.CountDocumentsAsync(f => f.ItemId == "theirs")).Should().Be(1);
    }

    private Task GrantViewToAnotherUserAsync(string resourceId) => _accessRepository.GrantAsync(new ObjectAccessPolicy
    {
        ItemId = $"{resourceId}-other-user-policy",
        TenantId = "tenant-1",
        ResourceId = resourceId,
        ResourceType = ObjectResourceType.File,
        PrincipalType = ObjectPrincipalType.User,
        PrincipalId = "user-2",
        Permission = ObjectPermission.View,
        Effect = ObjectEffect.Allow,
    });

    [Fact]
    public async Task Trash_operations_are_audited()
    {
        await SeedFile("file-1", "report.pdf", archived: true);

        await _discovery.RestoreAsync("file-1");

        var audit = await _accessRepository.GetAuditForResourceAsync("file-1");
        audit.Should().ContainSingle().Which.Action.Should().Be("Restore");
    }
}
