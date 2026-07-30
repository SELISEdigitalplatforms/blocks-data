using DomainService.Storage.Dms;
using FluentAssertions;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

namespace XUnitTest.Storage;

/// <summary>
/// Contract tests for the DMS response shapes. The mappers matter most: they are the
/// seam where a field added to an entity silently fails to reach the wire, which is the
/// kind of omission that shows up as a missing value in a client rather than a build
/// error.
/// </summary>
public class DmsContentDtoTests
{
    [Fact]
    public void An_access_policy_maps_every_field_onto_its_response_shape()
    {
        var expires = new DateTime(2027, 3, 1, 12, 0, 0, DateTimeKind.Utc);
        var created = new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc);

        var policy = new ContentAccessPolicy
        {
            ItemId = "policy-1",
            TenantId = "tenant-1",
            ResourceId = "dir-1",
            ResourceType = ContentResourceType.Folder,
            PrincipalType = ContentPrincipalType.Role,
            PrincipalId = "editors",
            Permission = ContentPermission.Manage,
            Effect = ContentEffect.Deny,
            Priority = 7,
            ExpiresAt = expires,
            GrantedBy = "user-1",
            CreatedDate = created,
        };

        var dto = AccessPolicyDto.From(policy);

        dto.ItemId.Should().Be("policy-1");
        dto.ResourceId.Should().Be("dir-1");
        dto.ResourceType.Should().Be(ContentResourceType.Folder);
        dto.PrincipalType.Should().Be(ContentPrincipalType.Role);
        dto.PrincipalId.Should().Be("editors");
        dto.Permission.Should().Be(ContentPermission.Manage);
        dto.Effect.Should().Be(ContentEffect.Deny);
        dto.Priority.Should().Be(7);
        dto.ExpiresAt.Should().Be(expires);
        dto.GrantedBy.Should().Be("user-1");
        dto.CreatedDate.Should().Be(created);
    }

    [Fact]
    public void An_access_policy_response_does_not_carry_the_tenant()
    {
        // The tenant is ambient on the request, so echoing it back would be noise at
        // best and a small information leak at worst.
        typeof(AccessPolicyDto).GetProperty("TenantId").Should().BeNull();
    }

    [Fact]
    public void A_permanent_grant_maps_a_null_expiry_rather_than_a_default_date()
    {
        var dto = AccessPolicyDto.From(new ContentAccessPolicy
        {
            ItemId = "policy-1",
            ResourceId = "dir-1",
            ExpiresAt = null,
        });

        dto.ExpiresAt.Should().BeNull();
    }

    [Fact]
    public void A_file_version_maps_onto_its_response_shape()
    {
        var version = FileVersion.CreateNew("file-1", 3, new FileVersionOptions
        {
            ItemId = "ver-1",
            TenantId = "tenant-1",
            CreatedBy = "author",
            CreateDate = new DateTime(2026, 7, 30, 10, 0, 0, DateTimeKind.Utc),
            StorageKey = "Private/file-1/ver-1/doc.txt",
            UploadedBy = "user-2",
        });
        version.SizeInBytes = 2048;

        var dto = FileVersionDto.From(version);

        dto.ItemId.Should().Be("ver-1");
        dto.No.Should().Be(3);
        dto.SizeInBytes.Should().Be(2048);
        dto.UploadedBy.Should().Be("user-2");
        dto.CreatedDate.Should().Be(version.CreatedDate);
    }

    [Fact]
    public void A_file_version_response_does_not_expose_the_storage_key()
    {
        // The object key is an internal storage detail. Clients reach content through a
        // pre-signed url, never by constructing a key themselves.
        typeof(FileVersionDto).GetProperty("StorageKey").Should().BeNull();
    }

    [Fact]
    public void Permission_flags_default_to_granting_nothing()
    {
        // Default deny has to hold for the wire shape too: a response built without
        // resolution must not read as full access.
        var flags = new PermissionFlags();

        flags.CanView.Should().BeFalse();
        flags.CanDownload.Should().BeFalse();
        flags.CanEdit.Should().BeFalse();
        flags.CanDelete.Should().BeFalse();
        flags.CanManage.Should().BeFalse();
        flags.CanOwner.Should().BeFalse();
    }

    [Fact]
    public void A_folder_item_carries_folder_fields_and_leaves_the_file_ones_null()
    {
        var item = new DmsItem
        {
            ItemId = "dir-1",
            Name = "Reports",
            Type = StructureType.Directory,
            ParentFolderId = "root",
            SizeInBytes = 4096,
            ChildFolderCount = 2,
            ChildFileCount = 5,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
            LastUpdatedDate = DateTime.UtcNow,
        };

        item.Type.Should().Be(StructureType.Directory);
        item.ChildFolderCount.Should().Be(2);
        item.ChildFileCount.Should().Be(5);
        item.Extension.Should().BeNull();
        item.ContentType.Should().BeNull();
        item.CurrentVersion.Should().BeNull();
        item.Permissions.CanView.Should().BeFalse();
    }

    [Fact]
    public void A_file_item_carries_file_fields_and_leaves_the_folder_ones_null()
    {
        var item = new DmsItem
        {
            ItemId = "file-1",
            Name = "doc.txt",
            Type = StructureType.File,
            ParentFolderId = "dir-1",
            SizeInBytes = 42,
            Extension = "txt",
            ContentType = "text/plain",
            CurrentVersion = 3,
            Permissions = new PermissionFlags { CanView = true, CanDownload = true },
        };

        item.Type.Should().Be(StructureType.File);
        item.Extension.Should().Be("txt");
        item.ContentType.Should().Be("text/plain");
        item.CurrentVersion.Should().Be(3);
        item.ChildFolderCount.Should().BeNull();
        item.ChildFileCount.Should().BeNull();
        item.Permissions.CanDownload.Should().BeTrue();
        item.Permissions.CanEdit.Should().BeFalse();
    }

    [Fact]
    public void An_empty_children_response_reports_no_more_pages()
    {
        var response = new ChildrenResponse();

        response.Items.Should().NotBeNull().And.BeEmpty();
        response.NextCursor.Should().BeNull();
        response.HasMore.Should().BeFalse();
        response.TotalChildCount.Should().Be(0);
    }

    [Fact]
    public void A_children_response_can_report_more_pages_than_it_returned()
    {
        // The raw count deliberately disagrees with the item count when access filtering
        // removed something, so the two are not asserted to match anywhere.
        var response = new ChildrenResponse
        {
            Items = new List<DmsItem> { new() { ItemId = "file-1", Type = StructureType.File } },
            NextCursor = "cursor-token",
            TotalChildCount = 12,
            HasMore = true,
        };

        response.Items.Should().ContainSingle();
        response.TotalChildCount.Should().Be(12);
        response.HasMore.Should().BeTrue();
        response.NextCursor.Should().Be("cursor-token");
    }

    [Fact]
    public void A_file_versions_response_defaults_to_an_empty_exhausted_page()
    {
        var response = new FileVersionsResponse();

        response.Items.Should().NotBeNull().And.BeEmpty();
        response.NextCursor.Should().BeNull();
        response.HasMore.Should().BeFalse();
    }

    [Fact]
    public void Request_contracts_default_to_usable_page_sizes()
    {
        // These defaults are what a caller gets when it omits paging entirely, so they
        // have to sit inside the ranges the validators accept.
        new GetFolderChildrenRequest().Limit.Should().Be(50);
        new ContentSearchRequest().Limit.Should().Be(50);
        new TrashRequest().Limit.Should().Be(50);
        new GetFileVersionsRequest().Limit.Should().Be(25);
    }

    [Fact]
    public void A_grant_request_defaults_to_allow_rather_than_deny()
    {
        // An omitted effect must not silently produce a denial.
        new GrantAccessRequest().Effect.Should().Be(ContentEffect.Allow);
    }

    [Fact]
    public void A_copy_request_defaults_to_leaving_access_entries_behind()
    {
        new CopyFileRequest().CopyAccessPolicies.Should().BeFalse();
    }

    [Fact]
    public void Optional_request_fields_start_empty()
    {
        var create = new CreateFolderRequest { Name = "Reports" };

        create.ParentFolderId.Should().BeNull();
        create.Description.Should().BeNull();
        create.AllowedFileExtensions.Should().BeNull("no restriction is the default");

        var move = new MoveFolderRequest { FolderId = "dir-1" };
        move.TargetFolderId.Should().BeNull("the top level is a legitimate destination");

        var search = new ContentSearchRequest { Query = "report" };
        search.FolderId.Should().BeNull();
        search.Type.Should().BeNull("both kinds are searched unless narrowed");

        var update = new UpdateFolderRequest { FolderId = "dir-1" };
        update.Name.Should().BeNull();

        var version = new CreateFileVersionRequest { FileId = "file-1" };
        version.ConfigurationName.Should().BeNull();

        var revoke = new RevokeAccessRequest { ResourceId = "dir-1", PolicyItemId = "p-1" };
        revoke.PolicyItemId.Should().Be("p-1");

        var restore = new RestoreFromTrashRequest { ResourceId = "dir-1" };
        restore.ResourceId.Should().Be("dir-1");

        var toggle = new ToggleInheritanceRequest { ResourceId = "dir-1" };
        toggle.InheritsParentAccess.Should().BeFalse();

        var moveFile = new MoveFileRequest { FileId = "file-1", TargetFolderId = "dir-2" };
        moveFile.TargetFolderId.Should().Be("dir-2");
    }
}
