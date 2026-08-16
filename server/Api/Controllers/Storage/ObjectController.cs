using Blocks.Genesis;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;

namespace Api.Controllers
{
    /// <summary>
    /// Sharing, access policies, search and the trash.
    /// </summary>
    /// <remarks>
    /// Every action here is authorised twice: the endpoint permission decides who may
    /// call it at all, and the service resolves the caller's access to the specific
    /// resource. Holding <c>blocks-data::object::grant-access</c> does not let anyone grant
    /// access to a directory they cannot Manage.
    /// </remarks>
    [ApiController]
    [Route("[controller]")]
    public class ObjectController : ControllerBase
    {
        private readonly IObjectManagementService _objectManagementService;
        private readonly IObjectDiscoveryService _objectDiscoveryService;
        private readonly IFileDirectoryManagementService _directoryManagementService;

        public ObjectController(
            IObjectManagementService objectManagementService,
            IObjectDiscoveryService objectDiscoveryService,
            IFileDirectoryManagementService directoryManagementService)
        {
            _objectManagementService = objectManagementService;
            _objectDiscoveryService = objectDiscoveryService;
            _directoryManagementService = directoryManagementService;
        }

        /// <summary>Access-resolved, cursor-paginated files and directories under one parent.</summary>
        [HttpGet("GetObject")]
        [HttpGet("get-object")]
        [ProtectedEndPoint("blocks-data::object::get-object")]
        public async Task<IActionResult> GetObject([FromQuery] GetObjectRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.ParentDirectoryId) && request.ModuleName.HasValue)
            {
                var defaultDirectory = await _directoryManagementService
                    .GetDefaultDirectoryByModuleNameAsync(request.ModuleName.Value.ToString());

                if (defaultDirectory is null)
                {
                    return NotFound(new { message = $"Default directory not found for module: {request.ModuleName}" });
                }

                request.ParentDirectoryId = defaultDirectory.ItemId;
            }

            var page = await _objectDiscoveryService.GetObjectAsync(
                request.ParentDirectoryId, ObjectKind.FromApiString(request.Type), request.Search,
                request.Cursor, request.Limit);
            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Name search across directorys and files the caller may view.</summary>
        [HttpGet("SearchObject")]
        [HttpGet("search-object")]
        [ProtectedEndPoint("blocks-data::object::search-object")]
        public async Task<IActionResult> SearchObject([FromQuery] ObjectSearchRequest request)
        {
            var page = await _objectDiscoveryService.SearchAsync(
                request.Query, request.DirectoryId, ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Archived directorys and files the caller may view.</summary>
        [HttpGet("GetTrash")]
        [HttpGet("get-trash")]
        [ProtectedEndPoint("blocks-data::object::get-trash")]
        public async Task<IActionResult> GetTrash([FromQuery] TrashRequest request)
        {
            var page = await _objectDiscoveryService.GetTrashAsync(ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Live files and directorys explicitly shared with the caller.</summary>
        [HttpGet("GetSharedObject")]
        [HttpGet("get-shared-object")]
        // [ProtectedEndPoint("blocks-data::object::get-shared-object")]
        [Authorize]
        public async Task<IActionResult> GetSharedObject([FromQuery] SharedObjectRequest request)
        {
            var page = await _objectDiscoveryService.GetSharedAsync(
                ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Returns an archived item to its original parent.</summary>
        [HttpPost("RestoreFromTrash")]
        [HttpPost("restore-from-trash")]
        [ProtectedEndPoint("blocks-data::object::restore-object")]
        public async Task<IActionResult> RestoreFromTrash([FromBody] RestoreFromTrashRequest request)
        {
            var result = await _objectDiscoveryService.RestoreAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>Removes an archived item for good.</summary>
        [HttpPost("DeleteFromTrash")]
        [HttpPost("delete-from-trash")]
        [ProtectedEndPoint("blocks-data::object::delete-from-trash")]
        public async Task<IActionResult> DeleteFromTrash([FromBody] DeleteFromTrashRequest request)
        {
            var result = await _objectDiscoveryService.DeleteFromTrashAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>The access entries on a resource.</summary>
        [HttpGet("GetAccessPolicies")]
        [HttpGet("get-access-policies")]
        [ProtectedEndPoint("blocks-data::object::get-access-policies")]
        public async Task<IActionResult> GetAccessPolicies([FromQuery] GetAccessPoliciesRequest request)
        {
            var policies = await _objectManagementService.GetAccessAsync(request.ResourceId);

            return Ok(policies.Select(AccessPolicyDto.From).ToList());
        }

        /// <summary>Creates an access entry. Requires Manage on the resource.</summary>
        [HttpPost("GrantAccess")]
        [HttpPost("grant-access")]
        [ProtectedEndPoint("blocks-data::object::grant-access")]
        public async Task<IActionResult> GrantAccess([FromBody] GrantAccessRequest request)
        {
            var result = await _objectManagementService.GrantAccessAsync(ToPolicy(request));

            return MapAccess(result, created: true);
        }

        /// <summary>Updates an existing access entry.</summary>
        [HttpPost("UpdateAccessPolicy")]
        [HttpPost("update-access-policy")]
        [ProtectedEndPoint("blocks-data::object::update-access-policy")]
        public async Task<IActionResult> UpdateAccessPolicy([FromBody] GrantAccessRequest request)
        {
            var result = await _objectManagementService.UpdateAccessAsync(ToPolicy(request));

            return MapAccess(result, created: false);
        }

        /// <summary>Deletes an access entry.</summary>
        [HttpPost("RevokeAccessPolicy")]
        [HttpPost("revoke-access-policy")]
        [ProtectedEndPoint("blocks-data::object::revoke-access-policy")]
        public async Task<IActionResult> RevokeAccessPolicy([FromBody] RevokeAccessRequest request)
        {
            var result = await _objectManagementService.RevokeAccessAsync(request.ResourceId, request.PolicyItemId);

            return MapAccess(result, created: false);
        }

        /// <summary>The operations the calling user holds on a resource.</summary>
        [HttpGet("ResolveAccess")]
        [HttpGet("resolve-access")]
        [ProtectedEndPoint("blocks-data::object::resolve-access")]
        public async Task<IActionResult> ResolveAccess([FromQuery] string resourceId)
        {
            var flags = await _objectManagementService.ResolveAccessAsync(resourceId);

            if (flags is null)
            {
                return NotFound(new { message = $"Resource not found: {resourceId}" });
            }

            return Ok(PermissionFlags.From(flags));
        }

        /// <summary>Switches a resource between inheriting its parent's access and standing alone.</summary>
        [HttpPost("ToggleInheritance")]
        [HttpPost("toggle-inheritance")]
        [ProtectedEndPoint("blocks-data::object::toggle-inheritance")]
        public async Task<IActionResult> ToggleInheritance([FromBody] ToggleInheritanceRequest request)
        {
            var result = await _objectManagementService.ToggleInheritanceAsync(
                request.ResourceId, request.InheritsParentAccess);

            return MapAccess(result, created: false);
        }

        /// <summary>Grants a principal an allow entry and records it as a share.</summary>
        [HttpPost("ShareObject")]
        [HttpPost("share-object")]
        [ProtectedEndPoint("blocks-data::object::share-object")]
        public async Task<IActionResult> ShareObject([FromBody] ShareObjectRequest request)
        {
            var result = await _objectManagementService.ShareObjectAsync(
                request.ResourceId, request.ResourceType, request.PrincipalType,
                request.PrincipalId, request.Permission, request.ExpiresAt);

            return MapAccess(result, created: true);
        }

        private static ObjectAccessPolicy ToPolicy(GrantAccessRequest request) => new()
        {
            ItemId = request.PolicyItemId ?? string.Empty,
            ResourceId = request.ResourceId,
            ResourceType = request.ResourceType,
            PrincipalType = request.PrincipalType,
            PrincipalId = request.PrincipalId,
            Permission = request.Permission,
            Effect = request.Effect,
            Priority = request.Priority,
            ExpiresAt = request.ExpiresAt,
        };

        private IActionResult MapAccess(ObjectAccessOperationResult result, bool created) => result.Status switch
        {
            ObjectAccessOperationStatus.Succeeded when created =>
                Created(string.Empty, new { itemId = result.PolicyItemId }),
            ObjectAccessOperationStatus.Succeeded => Ok(new { itemId = result.PolicyItemId }),
            ObjectAccessOperationStatus.NotPermitted => Forbid(),
            ObjectAccessOperationStatus.SelfDenyRejected =>
                BadRequest(new { message = "A deny cannot be aimed at the owner of the resource it is authored on." }),
            ObjectAccessOperationStatus.PrincipalRequired =>
                BadRequest(new { message = "A principal is required for User, Role and Organization entries." }),
            ObjectAccessOperationStatus.WouldOrphanResource =>
                BadRequest(new { message = "Grant access on this resource before switching inheritance off." }),
            ObjectAccessOperationStatus.PolicyNotFound =>
                NotFound(new { message = "Access policy not found." }),
            _ => NotFound(new { message = "Resource not found." }),
        };

        private IActionResult MapTrash(TrashOperationResult result, string resourceId) => result.Status switch
        {
            TrashOperationStatus.Succeeded => Ok(new { resourceId }),
            TrashOperationStatus.NotPermitted => Forbid(),
            _ => NotFound(new { message = $"Resource not found in trash: {resourceId}" }),
        };
    }
}
