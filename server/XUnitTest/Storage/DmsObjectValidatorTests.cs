using DomainService.Storage.Dms;
using FluentAssertions;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage.Validators;

namespace XUnitTest.Storage;

/// <summary>
/// Rejection rules for the DMS request contracts. These validators only cover shape and
/// range: anything needing a database read, such as whether a name is already taken or
/// whether the caller may act on a resource, belongs to the service and is tested there.
/// </summary>
public class DmsObjectValidatorTests
{
    private static string ValidCursor() =>
        new ObjectCursor { Type = StructureType.File, Name = "doc.txt", ItemId = "file-1" }.Encode();

    // Create directory

    [Fact]
    public void A_directory_name_is_required()
    {
        var result = new CreateDirectoryRequestValidator().Validate(new CreateDirectoryRequest { Name = "" });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateDirectoryRequest.Name));
    }

    [Theory]
    [InlineData("reports/2026")]
    [InlineData("reports\\2026")]
    [InlineData(" leading")]
    [InlineData("trailing ")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("   ")]
    public void A_directory_name_that_would_break_a_path_is_rejected(string name)
    {
        // Path separators and the relative-path names would corrupt FullPath, and
        // surrounding whitespace produces two directorys that look identical in a tree.
        new CreateDirectoryRequestValidator()
            .Validate(new CreateDirectoryRequest { Name = name })
            .IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("Quarterly Reports")]
    [InlineData("2026-07")]
    [InlineData("naïve café")]
    [InlineData("a.b.c")]
    public void An_ordinary_directory_name_is_accepted(string name)
    {
        new CreateDirectoryRequestValidator()
            .Validate(new CreateDirectoryRequest { Name = name })
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_directory_name_longer_than_the_limit_is_rejected()
    {
        new CreateDirectoryRequestValidator()
            .Validate(new CreateDirectoryRequest { Name = new string('a', 256) })
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void A_directory_may_be_created_at_the_top_level()
    {
        new CreateDirectoryRequestValidator()
            .Validate(new CreateDirectoryRequest { Name = "Root level", ParentDirectoryId = null })
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_directory_update_may_omit_the_name_but_not_supply_a_bad_one()
    {
        var validator = new UpdateDirectoryRequestValidator();

        validator.Validate(new UpdateDirectoryRequest { DirectoryId = "dir-1" }).IsValid.Should().BeTrue();
        validator.Validate(new UpdateDirectoryRequest { DirectoryId = "dir-1", Name = "ok" }).IsValid.Should().BeTrue();
        validator.Validate(new UpdateDirectoryRequest { DirectoryId = "dir-1", Name = "bad/name" }).IsValid.Should().BeFalse();
        validator.Validate(new UpdateDirectoryRequest { DirectoryId = "", Name = "ok" }).IsValid.Should().BeFalse();
    }

    // Listing

    [Fact]
    public void A_children_request_accepts_an_empty_directory_for_root_listings()
    {
        var validator = new GetDirectoryChildrenRequestValidator();

        // An empty directory id selects the root listing rather than being rejected, so the
        // storage page can call the same endpoint before any directory has been opened.
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "" }).IsValid.Should().BeTrue();
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Limit = 0 }).IsValid.Should().BeFalse();
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Limit = 201 }).IsValid.Should().BeFalse();
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Limit = 50 }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_cursor_is_accepted_when_it_decodes_and_rejected_when_it_does_not()
    {
        var validator = new GetDirectoryChildrenRequestValidator();

        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Cursor = null }).IsValid.Should().BeTrue();
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Cursor = ValidCursor() }).IsValid.Should().BeTrue();
        validator.Validate(new GetDirectoryChildrenRequest { DirectoryId = "dir-1", Cursor = "obviously not base64 !!" }).IsValid.Should().BeFalse();
    }

    // Copy and move

    [Fact]
    public void Copy_and_move_both_need_a_source_and_a_target()
    {
        new CopyFileRequestValidator().Validate(new CopyFileRequest { FileId = "", TargetDirectoryId = "dir-1" }).IsValid.Should().BeFalse();
        new CopyFileRequestValidator().Validate(new CopyFileRequest { FileId = "file-1", TargetDirectoryId = "" }).IsValid.Should().BeFalse();
        new CopyFileRequestValidator().Validate(new CopyFileRequest { FileId = "file-1", TargetDirectoryId = "dir-1" }).IsValid.Should().BeTrue();

        new MoveFileRequestValidator().Validate(new MoveFileRequest { FileId = "file-1", TargetDirectoryId = "" }).IsValid.Should().BeFalse();
        new MoveFileRequestValidator().Validate(new MoveFileRequest { FileId = "file-1", TargetDirectoryId = "dir-1" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_directory_cannot_be_moved_into_itself()
    {
        var validator = new MoveDirectoryRequestValidator();

        validator.Validate(new MoveDirectoryRequest { DirectoryId = "dir-1", TargetDirectoryId = "dir-1" }).IsValid.Should().BeFalse();
        validator.Validate(new MoveDirectoryRequest { DirectoryId = "dir-1", TargetDirectoryId = "dir-2" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_directory_may_be_moved_to_the_top_level()
    {
        // An empty target means the top level, which is legitimate. Only the descendant
        // case needs the stored hierarchy, so the service checks that rather than this.
        new MoveDirectoryRequestValidator()
            .Validate(new MoveDirectoryRequest { DirectoryId = "dir-1", TargetDirectoryId = null })
            .IsValid.Should().BeTrue();
    }

    // Access

    [Theory]
    [InlineData(ObjectPrincipalType.User)]
    [InlineData(ObjectPrincipalType.Role)]
    [InlineData(ObjectPrincipalType.Organization)]
    public void A_grant_needs_a_principal_for_every_kind_except_everyone(ObjectPrincipalType principalType)
    {
        var result = new GrantAccessRequestValidator().Validate(new GrantAccessRequest
        {
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = principalType,
            PrincipalId = null,
            Permission = ObjectPermission.View,
        });

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void An_everyone_grant_needs_no_principal()
    {
        new GrantAccessRequestValidator().Validate(new GrantAccessRequest
        {
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.Everyone,
            PrincipalId = null,
            Permission = ObjectPermission.View,
        }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_grant_with_an_undefined_enum_value_is_rejected()
    {
        // Guards against a client posting a number outside the contract, which would
        // otherwise land in storage as an unrecognised permission.
        new GrantAccessRequestValidator().Validate(new GrantAccessRequest
        {
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.Everyone,
            Permission = (ObjectPermission)99,
        }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void An_expiry_in_the_past_is_rejected()
    {
        var validator = new GrantAccessRequestValidator();

        GrantAccessRequest WithExpiry(DateTime? expiry) => new()
        {
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.Everyone,
            Permission = ObjectPermission.View,
            ExpiresAt = expiry,
        };

        validator.Validate(WithExpiry(DateTime.UtcNow.AddMinutes(-1))).IsValid.Should().BeFalse();
        validator.Validate(WithExpiry(DateTime.UtcNow.AddHours(1))).IsValid.Should().BeTrue();
        validator.Validate(WithExpiry(null)).IsValid.Should().BeTrue("no expiry means a permanent grant");
    }

    [Fact]
    public void A_grant_that_omits_the_resource_type_is_rejected()
    {
        // The Object enums deliberately start at 1, so an omitted value lands on 0 and
        // fails the enum check rather than defaulting silently to Directory.
        new GrantAccessRequestValidator().Validate(new GrantAccessRequest
        {
            ResourceId = "dir-1",
            PrincipalType = ObjectPrincipalType.Everyone,
            Permission = ObjectPermission.View,
        }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void A_negative_priority_is_rejected()
    {
        new GrantAccessRequestValidator().Validate(new GrantAccessRequest
        {
            ResourceId = "dir-1",
            ResourceType = ObjectResourceType.Directory,
            PrincipalType = ObjectPrincipalType.Everyone,
            Permission = ObjectPermission.View,
            Priority = -1,
        }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Revoke_needs_both_the_resource_and_the_entry()
    {
        var validator = new RevokeAccessRequestValidator();

        validator.Validate(new RevokeAccessRequest { ResourceId = "dir-1", PolicyItemId = "" }).IsValid.Should().BeFalse();
        validator.Validate(new RevokeAccessRequest { ResourceId = "", PolicyItemId = "p-1" }).IsValid.Should().BeFalse();
        validator.Validate(new RevokeAccessRequest { ResourceId = "dir-1", PolicyItemId = "p-1" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Toggling_inheritance_needs_a_resource_and_accepts_either_setting()
    {
        var validator = new ToggleInheritanceRequestValidator();

        validator.Validate(new ToggleInheritanceRequest { ResourceId = "" }).IsValid.Should().BeFalse();
        validator.Validate(new ToggleInheritanceRequest { ResourceId = "dir-1", InheritsParentAccess = false }).IsValid.Should().BeTrue(
            "whether switching it off is safe depends on stored entries, so the service decides that");
        validator.Validate(new ToggleInheritanceRequest { ResourceId = "dir-1", InheritsParentAccess = true }).IsValid.Should().BeTrue();
    }

    // Search, trash and versions

    [Fact]
    public void A_search_needs_a_query_and_a_sane_page_size()
    {
        var validator = new ObjectSearchRequestValidator();

        validator.Validate(new ObjectSearchRequest { Query = "" }).IsValid.Should().BeFalse();
        validator.Validate(new ObjectSearchRequest { Query = "report", Limit = 0 }).IsValid.Should().BeFalse();
        validator.Validate(new ObjectSearchRequest { Query = "report", Limit = 20 }).IsValid.Should().BeTrue();
        validator.Validate(new ObjectSearchRequest { Query = "report", Cursor = "bad!" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void A_trash_listing_validates_its_page_size_and_cursor()
    {
        var validator = new TrashRequestValidator();

        validator.Validate(new TrashRequest { Limit = 0 }).IsValid.Should().BeFalse();
        validator.Validate(new TrashRequest { Limit = 201 }).IsValid.Should().BeFalse();
        validator.Validate(new TrashRequest { Limit = 50, Cursor = ValidCursor() }).IsValid.Should().BeTrue();

        new RestoreFromTrashRequestValidator().Validate(new RestoreFromTrashRequest { ResourceId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void A_version_listing_uses_a_version_number_as_its_cursor()
    {
        // Deliberately different from the encoded listing cursor, so it is validated
        // differently rather than being run through the base64 decoder.
        var validator = new GetFileVersionsRequestValidator();

        validator.Validate(new GetFileVersionsRequest { FileId = "file-1", Cursor = "12" }).IsValid.Should().BeTrue();
        validator.Validate(new GetFileVersionsRequest { FileId = "file-1", Cursor = null }).IsValid.Should().BeTrue();
        validator.Validate(new GetFileVersionsRequest { FileId = "file-1", Cursor = ValidCursor() }).IsValid.Should().BeFalse();
        validator.Validate(new GetFileVersionsRequest { FileId = "file-1", Limit = 101 }).IsValid.Should().BeFalse();
        validator.Validate(new GetFileVersionsRequest { FileId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Creating_a_version_needs_the_file()
    {
        new CreateFileVersionRequestValidator().Validate(new CreateFileVersionRequest { FileId = "" }).IsValid.Should().BeFalse();
        new CreateFileVersionRequestValidator().Validate(new CreateFileVersionRequest { FileId = "file-1" }).IsValid.Should().BeTrue();
    }
}
