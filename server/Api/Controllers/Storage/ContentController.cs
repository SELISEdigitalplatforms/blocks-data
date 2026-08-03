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
    /// resource. Holding <c>blocks-data::grant-access</c> does not let anyone grant
    /// access to a directory they cannot Manage.
    /// </remarks>
    [ApiController]
    [Route("[controller]/[action]")]
    public class ContentController : ControllerBase
    {
        private readonly IContentManagementService _contentManagementService;
        private readonly IContentDiscoveryService _contentDiscoveryService;

        public ContentController(
            IContentManagementService contentManagementService,
            IContentDiscoveryService contentDiscoveryService)
        {
            _contentManagementService = contentManagementService;
            _contentDiscoveryService = contentDiscoveryService;
        }

        /// <summary>Name search across directorys and files the caller may view.</summary>
        [HttpGet]
        // [ProtectedEndPoint("blocks-data::search-content")]
        [Authorize]
        public async Task<IActionResult> SearchContent([FromQuery] ContentSearchRequest request)
        {
            var page = await _contentDiscoveryService.SearchAsync(
                request.Query, request.DirectoryId, ContentKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Archived directorys and files the caller may view.</summary>
        [HttpGet]
        // [ProtectedEndPoint("blocks-data::get-trash")]
        [Authorize]
        public async Task<IActionResult> GetTrash([FromQuery] TrashRequest request)
        {
            var page = await _contentDiscoveryService.GetTrashAsync(ContentKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Returns an archived item to its original parent.</summary>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::restore-content")]
        [Authorize]
        public async Task<IActionResult> RestoreFromTrash([FromBody] RestoreFromTrashRequest request)
        {
            var result = await _contentDiscoveryService.RestoreAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>Removes an archived item for good.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::delete-from-trash")]
        [Authorize]
        public async Task<IActionResult> DeleteFromTrash([FromBody] DeleteFromTrashRequest request)
        {
            var result = await _contentDiscoveryService.DeleteFromTrashAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>The access entries on a resource.</summary>
        [HttpGet]
        // [ProtectedEndPoint("blocks-data::get-access-policies")]
        [Authorize]
        public async Task<IActionResult> GetAccessPolicies([FromQuery] GetAccessPoliciesRequest request)
        {
            var policies = await _contentManagementService.GetAccessAsync(request.ResourceId);

            return Ok(policies.Select(AccessPolicyDto.From).ToList());
        }

        /// <summary>Creates an access entry. Requires Manage on the resource.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::grant-access")]
        [Authorize]
        public async Task<IActionResult> GrantAccess([FromBody] GrantAccessRequest request)
        {
            var result = await _contentManagementService.GrantAccessAsync(ToPolicy(request));

            return MapAccess(result, created: true);
        }

        /// <summary>Updates an existing access entry.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::update-access-policy")]
        [Authorize]
        public async Task<IActionResult> UpdateAccessPolicy([FromBody] GrantAccessRequest request)
        {
            var result = await _contentManagementService.UpdateAccessAsync(ToPolicy(request));

            return MapAccess(result, created: false);
        }

        /// <summary>Deletes an access entry.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::revoke-access-policy")]
        [Authorize]
        public async Task<IActionResult> RevokeAccessPolicy([FromBody] RevokeAccessRequest request)
        {
            var result = await _contentManagementService.RevokeAccessAsync(request.ResourceId, request.PolicyItemId);

            return MapAccess(result, created: false);
        }

        /// <summary>The operations the calling user holds on a resource.</summary>
        [HttpGet]
        // [ProtectedEndPoint("blocks-data::resolve-access")]
        [Authorize]
        public async Task<IActionResult> ResolveAccess([FromQuery] string resourceId)
        {
            var flags = await _contentManagementService.ResolveAccessAsync(resourceId);

            if (flags is null)
            {
                return NotFound(new { message = $"Resource not found: {resourceId}" });
            }

            return Ok(PermissionFlags.From(flags));
        }

        /// <summary>Switches a resource between inheriting its parent's access and standing alone.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::toggle-inheritance")]
        [Authorize]
        public async Task<IActionResult> ToggleInheritance([FromBody] ToggleInheritanceRequest request)
        {
            var result = await _contentManagementService.ToggleInheritanceAsync(
                request.ResourceId, request.InheritsParentAccess);

            return MapAccess(result, created: false);
        }

        /// <summary>Grants a principal an allow entry and records it as a share.</summary>
        [HttpPost]
        // [ProtectedEndPoint("blocks-data::share-content")]
        [Authorize]
        public async Task<IActionResult> ShareContent([FromBody] ShareContentRequest request)
        {
            var result = await _contentManagementService.ShareContentAsync(
                request.ResourceId, request.ResourceType, request.PrincipalType,
                request.PrincipalId, request.Permission, request.ExpiresAt);

            return MapAccess(result, created: true);
        }

        private static ContentAccessPolicy ToPolicy(GrantAccessRequest request) => new()
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

        private IActionResult MapAccess(ContentAccessOperationResult result, bool created) => result.Status switch
        {
            ContentAccessOperationStatus.Succeeded when created =>
                Created(string.Empty, new { itemId = result.PolicyItemId }),
            ContentAccessOperationStatus.Succeeded => Ok(new { itemId = result.PolicyItemId }),
            ContentAccessOperationStatus.NotPermitted => Forbid(),
            ContentAccessOperationStatus.SelfDenyRejected =>
                BadRequest(new { message = "A deny cannot be aimed at the owner of the resource it is authored on." }),
            ContentAccessOperationStatus.PrincipalRequired =>
                BadRequest(new { message = "A principal is required for User, Role and Organization entries." }),
            ContentAccessOperationStatus.WouldOrphanResource =>
                BadRequest(new { message = "Grant access on this resource before switching inheritance off." }),
            ContentAccessOperationStatus.PolicyNotFound =>
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
