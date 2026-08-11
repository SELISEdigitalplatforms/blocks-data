using Blocks.Genesis;
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
/// Covers access administration. These are the writes that decide who can reach content,
/// so each case states the outcome it protects: the two rules enforced here exist to stop
/// an administrator storing an entry that either does nothing or locks everyone out.
/// </summary>
[Collection("Mongo")]
public class ContentManagementServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _accessRepository;
    private readonly ContentManagementService _management;

    public ContentManagementServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<FileDirectory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileDirectory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAuditLog>(n));

        _accessRepository = new ContentAccessRepository(provider.Object);
        _management = new ContentManagementService(provider.Object, _accessRepository, new ContentAccessResolver(_accessRepository));

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1", organizationId: "org-1", roles: new[] { "editor" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    /// <summary>A directory the caller created, so they hold Manage through ownership.</summary>
    private Task OwnedDirectory(string id = "dir-1", string createdBy = "user-1", bool inherits = true)
        => _db.GetCollection<FileDirectory>("FileDirectories").InsertOneAsync(new FileDirectory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = id,
            SystemName = id,
            Type = StructureType.Directory,
            AncestorIds = new List<string>(),
            InheritsParentAccess = inherits,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private Task FileDoc(string id = "file-1", string createdBy = "user-1", bool inherits = true)
        => _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = id,
            SystemName = id,
            Type = StructureType.File,
            DirectoryId = "dir-1",
            AncestorIds = new List<string> { "dir-1" },
            InheritsParentAccess = inherits,
            CreatedBy = createdBy,
            CreatedDate = DateTime.UtcNow,
        });

    private static ContentAccessPolicy Policy(
        string resourceId = "dir-1",
        ContentPrincipalType principalType = ContentPrincipalType.Role,
        string? principalId = "auditors",
        ContentPermission permission = ContentPermission.View,
        ContentEffect effect = ContentEffect.Allow) => new()
        {
            ResourceId = resourceId,
            ResourceType = ContentResourceType.Directory,
            PrincipalType = principalType,
            PrincipalId = principalId,
            Permission = permission,
            Effect = effect,
        };

    private async Task<List<ContentAuditLog>> Audit(string resourceId) =>
        await _accessRepository.GetAuditForResourceAsync(resourceId);

    private Task RestrictToAnotherUser(string resourceId = "dir-1") =>
        _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = resourceId,
            ResourceType = ContentResourceType.Directory,
            PrincipalType = ContentPrincipalType.User,
            PrincipalId = "user-2",
            Permission = ContentPermission.Owner,
            Effect = ContentEffect.Allow,
        });

    // Authorisation

    [Fact]
    public async Task Granting_on_a_resource_that_does_not_exist_is_refused()
    {
        var result = await _management.GrantAccessAsync(Policy("nope"));

        result.Status.Should().Be(ContentAccessOperationStatus.ResourceNotFound);
    }

    [Fact]
    public async Task A_caller_without_manage_cannot_grant_and_the_attempt_is_audited()
    {
        await OwnedDirectory(createdBy: "someone-else");
        await RestrictToAnotherUser();

        var result = await _management.GrantAccessAsync(Policy());

        result.Status.Should().Be(ContentAccessOperationStatus.NotPermitted);
        (await _accessRepository.GetByResourceAsync("dir-1"))
            .Should().ContainSingle(p => p.PrincipalId == "user-2");

        var audit = await Audit("dir-1");
        audit.Should().ContainSingle();
        audit[0].Granted.Should().BeFalse("a refused attempt still belongs in the log");
        audit[0].UserId.Should().Be("user-1");
    }

    [Fact]
    public async Task The_owner_of_a_resource_holds_manage_without_an_explicit_entry()
    {
        await OwnedDirectory();

        var result = await _management.GrantAccessAsync(Policy());

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
    }

    [Fact]
    public async Task An_explicit_manage_grant_is_enough_to_administer_a_resource_owned_by_someone_else()
    {
        await OwnedDirectory(createdBy: "someone-else");
        await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "dir-1",
            ResourceType = ContentResourceType.Directory,
            PrincipalType = ContentPrincipalType.User,
            PrincipalId = "user-1",
            Permission = ContentPermission.Manage,
            Effect = ContentEffect.Allow,
        });

        (await _management.GrantAccessAsync(Policy())).Status.Should().Be(ContentAccessOperationStatus.Succeeded);
    }

    // Validation

    [Fact]
    public async Task A_deny_aimed_at_the_owner_is_refused_rather_than_stored()
    {
        // Resolution treats such an entry as void, so storing it would leave something
        // that looks like it restricts the owner and does not.
        await OwnedDirectory(createdBy: "user-1");

        var result = await _management.GrantAccessAsync(
            Policy(principalType: ContentPrincipalType.User, principalId: "user-1", effect: ContentEffect.Deny));

        result.Status.Should().Be(ContentAccessOperationStatus.SelfDenyRejected);
        (await _accessRepository.GetByResourceAsync("dir-1")).Should().BeEmpty();
    }

    [Fact]
    public async Task A_deny_aimed_at_someone_who_is_not_the_owner_is_allowed()
    {
        await OwnedDirectory();

        var result = await _management.GrantAccessAsync(
            Policy(principalType: ContentPrincipalType.User, principalId: "user-2", effect: ContentEffect.Deny));

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
    }

    [Theory]
    [InlineData(ContentPrincipalType.User)]
    [InlineData(ContentPrincipalType.Role)]
    [InlineData(ContentPrincipalType.Organization)]
    public async Task A_grant_without_a_principal_is_refused_for_every_kind_that_needs_one(ContentPrincipalType principalType)
    {
        await OwnedDirectory();

        var result = await _management.GrantAccessAsync(Policy(principalType: principalType, principalId: null));

        result.Status.Should().Be(ContentAccessOperationStatus.PrincipalRequired);
    }

    [Fact]
    public async Task An_everyone_grant_needs_no_principal()
    {
        await OwnedDirectory();

        var result = await _management.GrantAccessAsync(
            Policy(principalType: ContentPrincipalType.Everyone, principalId: null));

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
    }

    // Grant, update, revoke

    [Fact]
    public async Task A_grant_is_stamped_with_the_tenant_and_the_caller_and_audited()
    {
        await OwnedDirectory();

        var result = await _management.GrantAccessAsync(Policy());

        var stored = (await _accessRepository.GetByResourceAsync("dir-1")).Single();
        stored.TenantId.Should().Be("tenant-1");
        stored.GrantedBy.Should().Be("user-1");
        stored.ItemId.Should().Be(result.PolicyItemId);

        var audit = await Audit("dir-1");
        audit.Should().ContainSingle();
        audit[0].Action.Should().Be("Grant");
        audit[0].Granted.Should().BeTrue();
        audit[0].Detail.Should().Contain("auditors");
    }

    [Fact]
    public async Task Updating_an_entry_replaces_it_and_keeps_its_creation_time()
    {
        await OwnedDirectory();
        var created = await _management.GrantAccessAsync(Policy());
        var original = (await _accessRepository.GetByResourceAsync("dir-1")).Single();

        var edit = Policy(permission: ContentPermission.Edit);
        edit.ItemId = created.PolicyItemId!;

        var result = await _management.UpdateAccessAsync(edit);

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
        var stored = (await _accessRepository.GetByResourceAsync("dir-1")).Single();
        stored.Permission.Should().Be(ContentPermission.Edit);
        stored.CreatedDate.Should().BeCloseTo(original.CreatedDate, TimeSpan.FromSeconds(1));
        stored.LastUpdatedBy.Should().Be("user-1");
    }

    [Fact]
    public async Task Updating_an_entry_that_does_not_exist_is_refused()
    {
        await OwnedDirectory();
        var edit = Policy();
        edit.ItemId = Guid.NewGuid().ToString();

        (await _management.UpdateAccessAsync(edit)).Status.Should().Be(ContentAccessOperationStatus.PolicyNotFound);
    }

    [Fact]
    public async Task Revoking_removes_the_entry_and_records_it()
    {
        await OwnedDirectory();
        var created = await _management.GrantAccessAsync(Policy());

        var result = await _management.RevokeAccessAsync("dir-1", created.PolicyItemId!);

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
        (await _accessRepository.GetByResourceAsync("dir-1")).Should().BeEmpty();
        (await Audit("dir-1")).Should().Contain(a => a.Action == "Revoke");
    }

    [Fact]
    public async Task Revoking_an_entry_that_does_not_exist_is_refused()
    {
        await OwnedDirectory();

        (await _management.RevokeAccessAsync("dir-1", Guid.NewGuid().ToString()))
            .Status.Should().Be(ContentAccessOperationStatus.PolicyNotFound);
    }

    // Share

    [Fact]
    public async Task Sharing_creates_an_allow_entry_and_is_logged_as_a_share()
    {
        await OwnedDirectory();

        var result = await _management.ShareContentAsync(
            "dir-1", ContentResourceType.Directory, ContentPrincipalType.User, "user-9", ContentPermission.Download);

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);

        var stored = (await _accessRepository.GetByResourceAsync("dir-1")).Single();
        stored.Effect.Should().Be(ContentEffect.Allow);
        stored.Permission.Should().Be(ContentPermission.Download);
        stored.PrincipalId.Should().Be("user-9");

        // Distinguishing a share from a grant is the point: one is handing access to a
        // person, the other is an administrator adjusting policy.
        (await Audit("dir-1")).Should().Contain(a => a.Action == "Share");
    }

    [Fact]
    public async Task Sharing_honours_an_expiry()
    {
        await OwnedDirectory();
        var expires = DateTime.UtcNow.AddDays(7);

        await _management.ShareContentAsync(
            "dir-1", ContentResourceType.Directory, ContentPrincipalType.User, "user-9", ContentPermission.View, expires);

        (await _accessRepository.GetByResourceAsync("dir-1")).Single().ExpiresAt.Should().BeCloseTo(expires, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Sharing_without_manage_is_refused()
    {
        await OwnedDirectory(createdBy: "someone-else");
        await RestrictToAnotherUser();

        var result = await _management.ShareContentAsync(
            "dir-1", ContentResourceType.Directory, ContentPrincipalType.User, "user-9", ContentPermission.View);

        result.Status.Should().Be(ContentAccessOperationStatus.NotPermitted);
    }

    // Inheritance

    [Fact]
    public async Task Inheritance_cannot_be_switched_off_while_nothing_else_grants_access()
    {
        // Otherwise the resource becomes invisible to everyone, including the caller who
        // just made the change.
        await OwnedDirectory();

        var result = await _management.ToggleInheritanceAsync("dir-1", inherits: false);

        result.Status.Should().Be(ContentAccessOperationStatus.WouldOrphanResource);
        var directory = await _db.GetCollection<FileDirectory>("FileDirectories").Find(d => d.ItemId == "dir-1").SingleAsync();
        directory.InheritsParentAccess.Should().BeTrue("the refused change must not be written");
    }

    [Fact]
    public async Task Inheritance_can_be_switched_off_once_an_allow_entry_exists()
    {
        await OwnedDirectory();
        await _management.GrantAccessAsync(Policy(principalType: ContentPrincipalType.User, principalId: "user-1"));

        var result = await _management.ToggleInheritanceAsync("dir-1", inherits: false);

        result.Status.Should().Be(ContentAccessOperationStatus.Succeeded);
        var directory = await _db.GetCollection<FileDirectory>("FileDirectories").Find(d => d.ItemId == "dir-1").SingleAsync();
        directory.InheritsParentAccess.Should().BeFalse();
        (await Audit("dir-1")).Should().Contain(a => a.Detail != null && a.Detail.Contains("InheritsParentAccess=False"));
    }

    [Fact]
    public async Task A_deny_only_entry_does_not_count_as_granting_access()
    {
        await OwnedDirectory();
        await _management.GrantAccessAsync(
            Policy(principalType: ContentPrincipalType.User, principalId: "user-2", effect: ContentEffect.Deny));

        (await _management.ToggleInheritanceAsync("dir-1", inherits: false))
            .Status.Should().Be(ContentAccessOperationStatus.WouldOrphanResource);
    }

    [Fact]
    public async Task Inheritance_can_always_be_switched_back_on()
    {
        await OwnedDirectory(inherits: false);

        (await _management.ToggleInheritanceAsync("dir-1", inherits: true))
            .Status.Should().Be(ContentAccessOperationStatus.Succeeded);
    }

    [Fact]
    public async Task Inheritance_can_be_toggled_on_a_file_as_well_as_a_directory()
    {
        await OwnedDirectory();
        await FileDoc(inherits: false);

        (await _management.ToggleInheritanceAsync("file-1", inherits: true))
            .Status.Should().Be(ContentAccessOperationStatus.Succeeded);

        var file = await _db.GetCollection<File>("Files").Find(f => f.ItemId == "file-1").SingleAsync();
        file.InheritsParentAccess.Should().BeTrue();
    }

    // Reads

    [Fact]
    public async Task Resolving_access_reports_the_callers_permissions()
    {
        await OwnedDirectory();

        var flags = await _management.ResolveAccessAsync("dir-1");

        flags.Should().NotBeNull();
        flags!.CanOwner.Should().BeTrue();
    }

    [Fact]
    public async Task Resolving_access_on_an_unknown_resource_returns_nothing()
    {
        (await _management.ResolveAccessAsync("nope")).Should().BeNull();
    }

    [Fact]
    public async Task Listing_entries_requires_manage()
    {
        await OwnedDirectory(createdBy: "someone-else");
        await RestrictToAnotherUser();

        (await _management.GetAccessAsync("dir-1")).Should().BeEmpty();
    }

    [Fact]
    public async Task Listing_entries_returns_them_for_an_administrator()
    {
        await OwnedDirectory();
        await _management.GrantAccessAsync(Policy());

        (await _management.GetAccessAsync("dir-1")).Should().ContainSingle();
    }
}
