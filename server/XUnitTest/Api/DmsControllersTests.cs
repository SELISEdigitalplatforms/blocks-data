using Api.Controllers;
using DomainService.Storage.Dms;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Services;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace XUnitTest.Api
{
    /// <summary>
    /// Unit tests for <see cref="DirectoryController"/>. The controller's own job is mapping
    /// a service outcome onto a status code, and the mapping carries meaning: a refusal to
    /// read reports 404 rather than 403, because 403 would confirm that a directory exists to
    /// a caller who may not see it. The create split is the other piece of real logic here.
    /// </summary>
    public class DirectoryControllerTests
    {
        private readonly Mock<IFileDirectoryManagementService> _directorys = new();
        private readonly Mock<IObjectHierarchyService> _hierarchy = new();
        private readonly DirectoryController _sut;

        public DirectoryControllerTests() =>
            _sut = new DirectoryController(_directorys.Object, _hierarchy.Object);

        private static FileDirectory Directory(string id = "dir-1") => new()
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
        public async Task CreateDirectory_WithoutAParent_IsRejectedRatherThanCreatingARoot()
        {
            // Root creation carries a stronger permission that this action does not hold.
            // Branching inside one endpoint would make the two grants indistinguishable.
            var result = await _sut.CreateDirectory(new CreateDirectoryRequest { Name = "Reports" });

            result.Should().BeOfType<BadRequestObjectResult>();
            _directorys.Verify(f => f.CreateDirectoryAsync(
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<string[]?>(), It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task CreateDirectory_WithAParent_ForwardsAndReturns201()
        {
            _directorys.Setup(f => f.CreateDirectoryAsync(
                    "Reports", "root", null, null, null, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Success("new-id"));

            var result = await _sut.CreateDirectory(new CreateDirectoryRequest { Name = "Reports", ParentDirectoryId = "root" });

            result.Should().BeOfType<CreatedResult>();
        }

        [Fact]
        public async Task CreateDirectory_WithoutAParent_UsesTheSuppliedModuleDefaultDirectory()
        {
            _directorys
                .Setup(r => r.GetDefaultDirectoryByModuleNameAsync("DataGateway", It.IsAny<CancellationToken>()))
                .ReturnsAsync(Directory("module-root"));
            _directorys.Setup(f => f.CreateDirectoryAsync(
                    "Reports", "module-root", null, null, "DataGateway", null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Success("new-id"));
            var request = new CreateDirectoryRequest { Name = "Reports", ModuleName = ModuleName.DataGateway };

            var result = await _sut.CreateDirectory(request);

            result.Should().BeOfType<CreatedResult>();
            request.ParentDirectoryId.Should().Be("module-root");
        }

        [Fact]
        public async Task CreateDirectory_WithoutAParent_ReturnsNotFoundWhenTheModuleHasNoDefaultDirectory()
        {
            _directorys
                .Setup(r => r.GetDefaultDirectoryByModuleNameAsync("DataGateway", It.IsAny<CancellationToken>()))
                .ReturnsAsync((FileDirectory?)null);

            var result = await _sut.CreateDirectory(new CreateDirectoryRequest
            {
                Name = "Reports",
                ModuleName = ModuleName.DataGateway,
            });

            result.Should().BeOfType<NotFoundObjectResult>();
            _directorys.Verify(f => f.CreateDirectoryAsync(
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<string[]?>(), It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task CreateRootDirectory_PassesANullParent()
        {
            _directorys.Setup(f => f.CreateDirectoryAsync(
                    "Reports", null, null, null, null, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Success("new-id"));

            var result = await _sut.CreateRootDirectory(new CreateDirectoryRequest { Name = "Reports", ParentDirectoryId = "ignored" });

            result.Should().BeOfType<CreatedResult>();
            _directorys.Verify(f => f.CreateDirectoryAsync(
                "Reports", null, null, null, null, null, It.IsAny<CancellationToken>()), Times.Once);
        }

        [Theory]
        [InlineData(DirectoryOperationStatus.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(DirectoryOperationStatus.ParentNotFound, typeof(NotFoundObjectResult))]
        [InlineData(DirectoryOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task CreateDirectory_MapsEachRefusalOntoItsStatus(DirectoryOperationStatus status, Type expected)
        {
            _directorys.Setup(f => f.CreateDirectoryAsync(
                    It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(),
                    It.IsAny<string?>(), It.IsAny<string[]?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Failure(status));

            var result = await _sut.CreateDirectory(new CreateDirectoryRequest { Name = "x", ParentDirectoryId = "root" });

            result.Should().BeOfType(expected);
        }

        [Fact]
        public async Task GetDirectory_ReturnsTheDirectoryWithItsPermissions()
        {
            _directorys.Setup(f => f.GetDirectoryAsync("dir-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Success(
                    "dir-1", Directory(), new ObjectPermissionFlags { CanView = true, CanEdit = true }));

            var result = await _sut.GetDirectory("dir-1") as OkObjectResult;

            var body = result!.Value.Should().BeOfType<DirectoryDetailResponse>().Subject;
            body.ItemId.Should().Be("dir-1");
            body.FullPath.Should().Be("/Root/Reports");
            body.Permissions.CanEdit.Should().BeTrue();
            body.Permissions.CanDelete.Should().BeFalse();
        }

        [Fact]
        public async Task GetDirectory_ReportsNotFoundWhenTheCallerMayNotSeeIt()
        {
            _directorys.Setup(f => f.GetDirectoryAsync("dir-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(DirectoryOperationResult.Failure(DirectoryOperationStatus.NotFound));

            (await _sut.GetDirectory("dir-1")).Should().BeOfType<NotFoundObjectResult>();
        }

        [Theory]
        [InlineData(DirectoryOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(DirectoryOperationStatus.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(DirectoryOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task UpdateDirectory_MapsTheOutcome(DirectoryOperationStatus status, Type expected)
        {
            _directorys.Setup(f => f.UpdateDirectoryAsync("dir-1", "New", null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == DirectoryOperationStatus.Succeeded
                    ? DirectoryOperationResult.Success("dir-1")
                    : DirectoryOperationResult.Failure(status));

            var result = await _sut.UpdateDirectory(new UpdateDirectoryRequest { DirectoryId = "dir-1", Name = "New" });

            result.Should().BeOfType(expected);
        }

        [Theory]
        [InlineData(DirectoryOperationStatus.Succeeded, typeof(OkObjectResult))]
        [InlineData(DirectoryOperationStatus.NotEmpty, typeof(ConflictObjectResult))]
        [InlineData(DirectoryOperationStatus.NotFound, typeof(NotFoundObjectResult))]
        public async Task DeleteDirectory_MapsTheOutcome(DirectoryOperationStatus status, Type expected)
        {
            _directorys.Setup(f => f.DeleteDirectoryAsync("dir-1", true, It.IsAny<CancellationToken>()))
                .ReturnsAsync(status == DirectoryOperationStatus.Succeeded
                    ? DirectoryOperationResult.Success("dir-1")
                    : DirectoryOperationResult.Failure(status));

            var result = await _sut.DeleteDirectory(new DeleteDirectoryRequest { DirectoryId = "dir-1", Permanent = true });

            result.Should().BeOfType(expected);
        }

        [Theory]
        [InlineData(MoveDirectoryResult.Moved, typeof(OkObjectResult))]
        [InlineData(MoveDirectoryResult.WouldCreateCycle, typeof(BadRequestObjectResult))]
        [InlineData(MoveDirectoryResult.NameConflict, typeof(ConflictObjectResult))]
        [InlineData(MoveDirectoryResult.TargetNotFound, typeof(NotFoundObjectResult))]
        [InlineData(MoveDirectoryResult.SourceNotFound, typeof(NotFoundObjectResult))]
        public async Task MoveDirectory_MapsEveryOutcome(MoveDirectoryResult outcome, Type expected)
        {
            _hierarchy.Setup(h => h.MoveDirectoryAsync("dir-1", "target", It.IsAny<CancellationToken>()))
                .ReturnsAsync(outcome);

            var result = await _sut.MoveDirectory(new MoveDirectoryRequest { DirectoryId = "dir-1", TargetDirectoryId = "target" });

            result.Should().BeOfType(expected);
        }
    }

    /// <summary>
    /// Unit tests for <see cref="ObjectController"/>. The access actions each map a
    /// refusal reason onto a distinct status, and those distinctions are what an
    /// administrator sees when a grant is rejected, so they are asserted individually
    /// rather than as a single "not success" case.
    /// </summary>
    public class ObjectControllerTests
    {
        private readonly Mock<IObjectManagementService> _management = new();
        private readonly Mock<IObjectDiscoveryService> _discovery = new();
        private readonly Mock<IFileDirectoryManagementService> _directorys = new();
        private readonly ObjectController _sut;

        public ObjectControllerTests() =>
            _sut = new ObjectController(_management.Object, _discovery.Object, _directorys.Object);

        [Fact]
        public async Task GetObject_ForwardsEveryListingArgument()
        {
            _discovery.Setup(d => d.GetObjectAsync(
                    "dir-1", StructureType.File, "report", "cursor-1", 25, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage { HasMore = true, NextCursor = "next", TotalChildCount = 9 });

            var result = await _sut.GetObject(new GetObjectRequest
            {
                ParentDirectoryId = "dir-1",
                Cursor = "cursor-1",
                Limit = 25,
                Type = "file",
                Search = "report",
            }) as OkObjectResult;

            var body = result!.Value.Should().BeOfType<ChildrenResponse>().Subject;
            body.HasMore.Should().BeTrue();
            body.NextCursor.Should().Be("next");
            body.TotalChildCount.Should().Be(9);
        }

        [Fact]
        public async Task GetObject_ResolvesAndAssignsTheModuleDefaultDirectory()
        {
            _directorys
                .Setup(r => r.GetDefaultDirectoryByModuleNameAsync("DataGateway", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new FileDirectory { ItemId = "module-root" });
            _discovery.Setup(d => d.GetObjectAsync(
                    "module-root", null, null, null, 50, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage());
            var request = new GetObjectRequest { ModuleName = ModuleName.DataGateway };

            var result = await _sut.GetObject(request);

            result.Should().BeOfType<OkObjectResult>();
            request.ParentDirectoryId.Should().Be("module-root");
        }

        [Fact]
        public async Task GetObject_ReturnsNotFoundWhenTheModuleHasNoDefaultDirectory()
        {
            _directorys
                .Setup(r => r.GetDefaultDirectoryByModuleNameAsync("DataGateway", It.IsAny<CancellationToken>()))
                .ReturnsAsync((FileDirectory?)null);

            var result = await _sut.GetObject(new GetObjectRequest { ModuleName = ModuleName.DataGateway });

            result.Should().BeOfType<NotFoundObjectResult>();
            _discovery.VerifyNoOtherCalls();
        }

        [Fact]
        public async Task SearchObject_ForwardsEveryArgument()
        {
            _discovery.Setup(d => d.SearchAsync(
                    "report", "dir-1", StructureType.File, "cursor", 10, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage { TotalChildCount = 3 });

            var result = await _sut.SearchObject(new ObjectSearchRequest
            {
                Query = "report",
                DirectoryId = "dir-1",
                Type = "file",
                Cursor = "cursor",
                Limit = 10,
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

            var result = await _sut.GetTrash(new TrashRequest { Type = "directory" });

            result.Should().BeOfType<OkObjectResult>();
            _discovery.Verify(d => d.GetTrashAsync(
                StructureType.Directory, null, 50, It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task GetSharedObject_ForwardsPaginationAndType()
        {
            _discovery.Setup(d => d.GetSharedAsync(
                    StructureType.File, "cursor", 10, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new VisibleChildrenPage { TotalChildCount = 1 });

            var result = await _sut.GetSharedObject(new SharedObjectRequest
            {
                Type = "file",
                Cursor = "cursor",
                Limit = 10,
            }) as OkObjectResult;

            result!.Value.Should().BeOfType<ChildrenResponse>()
                .Which.TotalChildCount.Should().Be(1);
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
                .ReturnsAsync(new List<ObjectAccessPolicy>
                {
                    new()
                    {
                        ItemId = "policy-1",
                        TenantId = "tenant-1",
                        ResourceId = "res-1",
                        PrincipalType = ObjectPrincipalType.Role,
                        PrincipalId = "editors",
                        Permission = ObjectPermission.Edit,
                        Effect = ObjectEffect.Allow,
                    },
                });

            var result = await _sut.GetAccessPolicies(new GetAccessPoliciesRequest { ResourceId = "res-1" }) as OkObjectResult;

            var body = result!.Value.Should().BeAssignableTo<List<AccessPolicyDto>>().Subject;
            body.Should().ContainSingle().Which.PrincipalId.Should().Be("editors");
        }

        [Fact]
        public async Task GrantAccess_MapsTheRequestOntoAPolicyAndReturns201()
        {
            ObjectAccessPolicy? captured = null;
            _management.Setup(m => m.GrantAccessAsync(It.IsAny<ObjectAccessPolicy>(), It.IsAny<CancellationToken>()))
                .Callback<ObjectAccessPolicy, CancellationToken>((p, _) => captured = p)
                .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));

            var result = await _sut.GrantAccess(new GrantAccessRequest
            {
                ResourceId = "res-1",
                ResourceType = ObjectResourceType.Directory,
                PrincipalType = ObjectPrincipalType.User,
                PrincipalId = "user-2",
                Permission = ObjectPermission.Download,
                Effect = ObjectEffect.Deny,
                Priority = 7,
            });

            result.Should().BeOfType<CreatedResult>();
            captured!.ResourceId.Should().Be("res-1");
            captured.PrincipalId.Should().Be("user-2");
            captured.Permission.Should().Be(ObjectPermission.Download);
            captured.Effect.Should().Be(ObjectEffect.Deny);
            captured.Priority.Should().Be(7);
        }

        [Theory]
        [InlineData(ObjectAccessOperationStatus.SelfDenyRejected, typeof(BadRequestObjectResult))]
        [InlineData(ObjectAccessOperationStatus.PrincipalRequired, typeof(BadRequestObjectResult))]
        [InlineData(ObjectAccessOperationStatus.WouldOrphanResource, typeof(BadRequestObjectResult))]
        [InlineData(ObjectAccessOperationStatus.PolicyNotFound, typeof(NotFoundObjectResult))]
        [InlineData(ObjectAccessOperationStatus.ResourceNotFound, typeof(NotFoundObjectResult))]
        public async Task GrantAccess_MapsEachRefusalReasonOntoItsOwnStatus(
            ObjectAccessOperationStatus status, Type expected)
        {
            _management.Setup(m => m.GrantAccessAsync(It.IsAny<ObjectAccessPolicy>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Failure(status));

            var result = await _sut.GrantAccess(new GrantAccessRequest { ResourceId = "res-1" });

            result.Should().BeOfType(expected);
        }

        [Fact]
        public async Task UpdateAccessPolicy_ReturnsOkRatherThanCreated()
        {
            _management.Setup(m => m.UpdateAccessAsync(It.IsAny<ObjectAccessPolicy>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));

            var result = await _sut.UpdateAccessPolicy(new GrantAccessRequest { ResourceId = "res-1", PolicyItemId = "policy-1" });

            result.Should().BeOfType<OkObjectResult>();
        }

        [Fact]
        public async Task RevokeAccessPolicy_ForwardsBothIdentifiers()
        {
            _management.Setup(m => m.RevokeAccessAsync("res-1", "policy-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));

            var result = await _sut.RevokeAccessPolicy(new RevokeAccessRequest { ResourceId = "res-1", PolicyItemId = "policy-1" });

            result.Should().BeOfType<OkObjectResult>();
            _management.Verify(m => m.RevokeAccessAsync("res-1", "policy-1", It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task ResolveAccess_ReturnsTheFlags()
        {
            _management.Setup(m => m.ResolveAccessAsync("res-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new ObjectPermissionFlags { CanView = true, CanDownload = true });

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
                .ReturnsAsync((ObjectPermissionFlags?)null);

            (await _sut.ResolveAccess("res-1")).Should().BeOfType<NotFoundObjectResult>();
        }

        [Fact]
        public async Task ToggleInheritance_ForwardsTheFlag()
        {
            _management.Setup(m => m.ToggleInheritanceAsync("res-1", false, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Success());

            var result = await _sut.ToggleInheritance(new ToggleInheritanceRequest
            {
                ResourceId = "res-1",
                InheritsParentAccess = false,
            });

            result.Should().BeOfType<OkObjectResult>();
        }

        [Fact]
        public async Task ToggleInheritance_RefusesToStrandAResource()
        {
            _management.Setup(m => m.ToggleInheritanceAsync("res-1", false, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.WouldOrphanResource));

            var result = await _sut.ToggleInheritance(new ToggleInheritanceRequest
            {
                ResourceId = "res-1",
                InheritsParentAccess = false,
            });

            result.Should().BeOfType<BadRequestObjectResult>();
        }

        [Fact]
        public async Task ShareObject_ForwardsEveryArgument()
        {
            var expires = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            _management.Setup(m => m.ShareObjectAsync(
                    "res-1", ObjectResourceType.File, ObjectPrincipalType.Role, "editors",
                    ObjectPermission.Download, expires, It.IsAny<CancellationToken>()))
                .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));

            var result = await _sut.ShareObject(new ShareObjectRequest
            {
                ResourceId = "res-1",
                ResourceType = ObjectResourceType.File,
                PrincipalType = ObjectPrincipalType.Role,
                PrincipalId = "editors",
                Permission = ObjectPermission.Download,
                ExpiresAt = expires,
            });

            result.Should().BeOfType<CreatedResult>();
        }
    }
}
