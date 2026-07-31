using Api.Controllers;
using DomainService.Storage.Dms;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Directory = Storage.DomainService.Entities.Directory;

namespace XUnitTest.Api
{
    /// <summary>
    /// Unit tests for <see cref="FoldersController"/>. The controller's own job is mapping
    /// a service outcome onto a status code, and the mapping carries meaning: a refusal to
    /// read reports 404 rather than 403, because 403 would confirm that a folder exists to
    /// a caller who may not see it. The create split is the other piece of real logic here.
    /// </summary>
    public class FoldersControllerTests
    {
        private readonly Mock<IFolderManagementService> _folders = new();
        private readonly Mock<IContentListingService> _listing = new();
        private readonly Mock<IContentHierarchyService> _hierarchy = new();
        private readonly FoldersController _sut;

        public FoldersControllerTests() =>
            _sut = new FoldersController(_folders.Object, _listing.Object, _hierarchy.Object);

        private static Directory Folder(string id = "dir-1") => new()
        {
            ItemId = id,
            Name = "Reports",
            TenantId = "tenant-1",
            Type = StructureType.Directory,
            AncestorIds = new List<string> { "root" },
            FullPath = "/Root/Reports",
            CreatedDate = DateTime.UtcNow,
            LastUpdatedDate = DateTime.UtcNow,
        };

        [Fact]
        public async Task CreateFolder_WithoutAParent_IsRejectedRatherThanCreatingARoot()
        {
            // Root creation carries a stronger permission that this action does not hold.
            // Branching inside one endpoint would make the two grants indistinguishable.
            var result = await _sut.CreateFolder(new CreateFolderRequest { Name = "Reports" });

            result.Should().BeOfType<BadRequestObjectResult>();
            _folders.Verify(f => f.CreateFolderAsync(
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<string[]?>(), It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task CreateFolder_WithAParent_ForwardsAndReturns201()
        {
            _folders.Setup(f => f.CreateFolderAsync(
                    "Reports", "root", null, null, null, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(FolderOperationResult.Success("new-id"));

            var result = await _sut.CreateFolder(new CreateFolderRequest { Name = "Reports", ParentFolderId = "root" });

            result.Should().BeOfType<CreatedResult>();
        }

        [Fact]
        public async Task CreateRootFolder_PassesANullParent()
        {
            _folders.Setup(f => f.CreateFolderAsync(
                    "Reports", null, null, null, null, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(FolderOperationResult.Success("new-id"));

            var result = await _sut.CreateRootFolder(new CreateFolderRequest { Name = "Reports", ParentFolderId = "ignored" });

            result.Should().BeOfType<CreatedResult>();
            _folders.Verify(f => f.CreateFolderAsync(
                "Reports", null, null, null, null, null, It.IsAny<CancellationToken>()), Times.Once);
        }

        [Theory]
        [InlineData(FolderOperationStatus.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(FolderOperationStatus.ParentNotFound, typeof(NotFoundObjectResult))]
        [InlineData(FolderOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task CreateFolder_MapsEachRefusalOntoItsStatus(FolderOperationStatus status, Type expected)
        {
            _folders.Setup(f => f.CreateFolderAsync(
                    It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                    It.IsAny<string?>(), It.IsAny<string[]?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(FolderOperationResult.Failure(status));

            var result = await _sut.CreateFolder(new CreateFolderRequest { Name = "x", ParentFolderId = "root" });

            result.Should().BeOfType(expected);
        }

        [Fact]
        public async Task GetFolder_ReturnsTheFolderWithItsPermissions()
        {
            _folders.Setup(f => f.GetFolderAsync("dir-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(FolderOperationResult.Success(
                    "dir-1", Folder(), new ContentPermissionFlags { CanView = true, CanEdit = true }));

            var result = await _sut.GetFolder("dir-1") as OkObjectResult;

            var body = result!.Value.Should().BeOfType<FolderDetailResponse>().Subject;
            body.ItemId.Should().Be("dir-1");
            body.FullPath.Should().Be("/Root/Reports");
            body.Permissions.CanEdit.Should().BeTrue();
            body.Permissions.CanDelete.Should().BeFalse();
        }

        [Fact]
        public async Task GetFolder_ReportsNotFoundWhenTheCallerMayNotSeeIt()
        {
            _folders.Setup(f => f.GetFolderAsync("dir-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(FolderOperationResult.Failure(FolderOperationStatus.NotFound));

            (await _sut.GetFolder("dir-1")).Should().BeOfType<NotFoundObjectResult>();
        }

        [Fact]
        public async Task GetFolderChildren_ForwardsEveryListingArgument()
        {
            _listing.Setup(l => l.GetVisibleChildrenAsync(
                    "dir-1", "cursor-1", 25, StructureType.File, "report", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage { HasMore = true, NextCursor = "next", TotalChildCount = 9 });

            var result = await _sut.GetFolderChildren(new GetFolderChildrenRequest
            {
                FolderId = "dir-1",
                Cursor = "cursor-1",
                Limit = 25,
                Type = StructureType.File,
                Search = "report",
            }) as OkObjectResult;

            var body = result!.Value.Should().BeOfType<ChildrenResponse>().Subject;
            body.HasMore.Should().BeTrue();
            body.NextCursor.Should().Be("next");
            body.TotalChildCount.Should().Be(9);
        }

        [Theory]
        [InlineData(FolderOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(FolderOperationStatus.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(FolderOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task UpdateFolder_MapsTheOutcome(FolderOperationStatus status, Type expected)
        {
            _folders.Setup(f => f.UpdateFolderAsync("dir-1", "New", null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == FolderOperationStatus.Succeeded
                    ? FolderOperationResult.Success("dir-1")
                    : FolderOperationResult.Failure(status));

            var result = await _sut.UpdateFolder(new UpdateFolderRequest { FolderId = "dir-1", Name = "New" });

            result.Should().BeOfType(expected);
        }

        [Theory]
        [InlineData(FolderOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(FolderOperationStatus.NotEmpty, typeof(ConflictObjectResult))]
        [InlineData(FolderOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task DeleteFolder_MapsTheOutcome(FolderOperationStatus status, Type expected)
        {
            _folders.Setup(f => f.DeleteFolderAsync("dir-1", true, It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == FolderOperationStatus.Succeeded
                    ? FolderOperationResult.Success("dir-1")
                    : FolderOperationResult.Failure(status));

            var result = await _sut.DeleteFolder(new DeleteFolderContentRequest { FolderId = "dir-1", Permanent = true });

            result.Should().BeOfType(expected);
        }

        [Theory]
        [InlineData(MoveFolderResult.Moved, typeof(OkObjectResult))]
        [InlineData(MoveFolderResult.WouldCreateCycle, typeof(BadRequestObjectResult))]
        [InlineData(MoveFolderResult.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(MoveFolderResult.TargetNotFound, typeof(NotFoundObjectResult))]
        [InlineData(MoveFolderResult.SourceNotFound, typeof(NotFoundObjectResult))]
        public async Task MoveFolder_MapsEveryOutcome(MoveFolderResult outcome, Type expected)
        {
            _hierarchy.Setup(h => h.MoveFolderAsync("dir-1", "target", It.IsAny<CancellationToken>()))
                .ReturnsAsync(outcome);

            var result = await _sut.MoveFolder(new MoveFolderRequest { FolderId = "dir-1", TargetFolderId = "target" });

            result.Should().BeOfType(expected);
        }
    }

    /// <summary>
    /// Unit tests for <see cref="ContentController"/>. The access actions each map a
    /// refusal reason onto a distinct status, and those distinctions are what an
    /// administrator sees when a grant is rejected, so they are asserted individually
    /// rather than as a single "not success" case.
    /// </summary>
    public class ContentControllerTests
    {
        private readonly Mock<IContentManagementService> _management = new();
        private readonly Mock<IContentDiscoveryService> _discovery = new();
        private readonly ContentController _sut;

        public ContentControllerTests() => _sut = new ContentController(_management.Object, _discovery.Object);

        [Fact]
        public async Task SearchContent_ForwardsEveryArgument()
        {
            _discovery.Setup(d => d.SearchAsync(
                    "report", "dir-1", StructureType.File, "cursor", 10, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage { TotalChildCount = 3 });

            var result = await _sut.SearchContent(new ContentSearchRequest
            {
                Query = "report", FolderId = "dir-1", Type = StructureType.File, Cursor = "cursor", Limit = 10,
            }) as OkObjectResult;

            result!.Value.Should().BeOfType<ChildrenResponse>()
                .Which.TotalChildCount.Should().Be(3);
        }

        [Fact]
        public async Task GetTrash_ForwardsTheTypeFilter()
        {
            _discovery.Setup(d => d.GetTrashAsync(
                    StructureType.Directory, null, 50, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage());

            var result = await _sut.GetTrash(new TrashRequest { Type = StructureType.Directory });

            result.Should().BeOfType<OkObjectResult>();
            _discovery.Verify(d => d.GetTrashAsync(
                StructureType.Directory, null, 50, It.IsAny<CancellationToken>()), Times.Once);
        }

        [Theory]
        [InlineData(TrashOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(TrashOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task RestoreFromTrash_MapsTheOutcome(TrashOperationStatus status, Type expected)
        {
            _discovery.Setup(d => d.RestoreAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == TrashOperationStatus.Succeeded
                    ? TrashOperationResult.Success()
                    : TrashOperationResult.Failure(status));

            var result = await _sut.RestoreFromTrash(new RestoreFromTrashRequest { ResourceId = "res-1" });

            result.Should().BeOfType(expected);
        }

        [Theory]
        [InlineData(TrashOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(TrashOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task DeleteFromTrash_MapsTheOutcome(TrashOperationStatus status, Type expected)
        {
            _discovery.Setup(d => d.DeleteFromTrashAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == TrashOperationStatus.Succeeded
                    ? TrashOperationResult.Success()
                    : TrashOperationResult.Failure(status));

            var result = await _sut.DeleteFromTrash(new DeleteFromTrashRequest { ResourceId = "res-1" });

            result.Should().BeOfType(expected);
        }

        [Fact]
        public async Task GetAccessPolicies_ReturnsTheWireShapeRatherThanTheEntity()
        {
            _management.Setup(m => m.GetAccessAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<ContentAccessPolicy>
                {
                    new()
                    {
                        ItemId = "policy-1",
                        TenantId = "tenant-1",
                        ResourceId = "res-1",
                        PrincipalType = ContentPrincipalType.Role,
                        PrincipalId = "editors",
                        Permission = ContentPermission.Edit,
                        Effect = ContentEffect.Allow,
                    },
                });

            var result = await _sut.GetAccessPolicies(new GetAccessPoliciesRequest { ResourceId = "res-1" }) as OkObjectResult;

            var body = result!.Value.Should().BeAssignableTo<List<AccessPolicyDto>>().Subject;
            body.Should().ContainSingle().Which.PrincipalId.Should().Be("editors");
        }

        [Fact]
        public async Task GrantAccess_MapsTheRequestOntoAPolicyAndReturns201()
        {
            ContentAccessPolicy? captured = null;
            _management.Setup(m => m.GrantAccessAsync(It.IsAny<ContentAccessPolicy>(), It.IsAny<CancellationToken>()))
                .Callback<ContentAccessPolicy, CancellationToken>((p, _) => captured = p)
                .ReturnsAsync(ContentAccessOperationResult.Success("policy-1"));

            var result = await _sut.GrantAccess(new GrantAccessRequest
            {
                ResourceId = "res-1",
                ResourceType = ContentResourceType.Folder,
                PrincipalType = ContentPrincipalType.User,
                PrincipalId = "user-2",
                Permission = ContentPermission.Download,
                Effect = ContentEffect.Deny,
                Priority = 7,
            });

            result.Should().BeOfType<CreatedResult>();
            captured!.ResourceId.Should().Be("res-1");
            captured.PrincipalId.Should().Be("user-2");
            captured.Permission.Should().Be(ContentPermission.Download);
            captured.Effect.Should().Be(ContentEffect.Deny);
            captured.Priority.Should().Be(7);
        }

        [Theory]
        [InlineData(ContentAccessOperationStatus.SelfDenyRejected, typeof(BadRequestObjectResult))]
        [InlineData(ContentAccessOperationStatus.PrincipalRequired, typeof(BadRequestObjectResult))]
        [InlineData(ContentAccessOperationStatus.WouldOrphanResource, typeof(BadRequestObjectResult))]
        [InlineData(ContentAccessOperationStatus.PolicyNotFound, typeof(NotFoundObjectResult))]
        [InlineData(ContentAccessOperationStatus.ResourceNotFound, typeof(NotFoundObjectResult))]
        public async Task GrantAccess_MapsEachRefusalReasonOntoItsOwnStatus(
            ContentAccessOperationStatus status, Type expected)
        {
            _management.Setup(m => m.GrantAccessAsync(It.IsAny<ContentAccessPolicy>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Failure(status));

            var result = await _sut.GrantAccess(new GrantAccessRequest { ResourceId = "res-1" });

            result.Should().BeOfType(expected);
        }

        [Fact]
        public async Task UpdateAccessPolicy_ReturnsOkRatherThanCreated()
        {
            _management.Setup(m => m.UpdateAccessAsync(It.IsAny<ContentAccessPolicy>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Success("policy-1"));

            var result = await _sut.UpdateAccessPolicy(new GrantAccessRequest { ResourceId = "res-1", PolicyItemId = "policy-1" });

            result.Should().BeOfType<OkObjectResult>();
        }

        [Fact]
        public async Task RevokeAccessPolicy_ForwardsBothIdentifiers()
        {
            _management.Setup(m => m.RevokeAccessAsync("res-1", "policy-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Success("policy-1"));

            var result = await _sut.RevokeAccessPolicy(new RevokeAccessRequest { ResourceId = "res-1", PolicyItemId = "policy-1" });

            result.Should().BeOfType<OkObjectResult>();
            _management.Verify(m => m.RevokeAccessAsync("res-1", "policy-1", It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task ResolveAccess_ReturnsTheFlags()
        {
            _management.Setup(m => m.ResolveAccessAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new ContentPermissionFlags { CanView = true, CanDownload = true });

            var result = await _sut.ResolveAccess("res-1") as OkObjectResult;

            var body = result!.Value.Should().BeOfType<PermissionFlags>().Subject;
            body.CanView.Should().BeTrue();
            body.CanDownload.Should().BeTrue();
            body.CanManage.Should().BeFalse();
        }

        [Fact]
        public async Task ResolveAccess_ReportsNotFoundForAnUnknownResource()
        {
            _management.Setup(m => m.ResolveAccessAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync((ContentPermissionFlags?)null);

            (await _sut.ResolveAccess("res-1")).Should().BeOfType<NotFoundObjectResult>();
        }

        [Fact]
        public async Task ToggleInheritance_ForwardsTheFlag()
        {
            _management.Setup(m => m.ToggleInheritanceAsync("res-1", false, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Success());

            var result = await _sut.ToggleInheritance(new ToggleInheritanceRequest
            {
                ResourceId = "res-1", InheritsParentAccess = false,
            });

            result.Should().BeOfType<OkObjectResult>();
        }

        [Fact]
        public async Task ToggleInheritance_RefusesToStrandAResource()
        {
            _management.Setup(m => m.ToggleInheritanceAsync("res-1", false, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Failure(ContentAccessOperationStatus.WouldOrphanResource));

            var result = await _sut.ToggleInheritance(new ToggleInheritanceRequest
            {
                ResourceId = "res-1", InheritsParentAccess = false,
            });

            result.Should().BeOfType<BadRequestObjectResult>();
        }

        [Fact]
        public async Task ShareContent_ForwardsEveryArgument()
        {
            var expires = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            _management.Setup(m => m.ShareContentAsync(
                    "res-1", ContentResourceType.File, ContentPrincipalType.Role, "editors",
                    ContentPermission.Download, expires, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ContentAccessOperationResult.Success("policy-1"));

            var result = await _sut.ShareContent(new ShareContentRequest
            {
                ResourceId = "res-1",
                ResourceType = ContentResourceType.File,
                PrincipalType = ContentPrincipalType.Role,
                PrincipalId = "editors",
                Permission = ContentPermission.Download,
                ExpiresAt = expires,
            });

            result.Should().BeOfType<CreatedResult>();
        }
    }
}
