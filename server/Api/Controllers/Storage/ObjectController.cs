using Blocks.Data.Api.Filters;
using Blocks.Genesis;
using DataGateway.DomainService.Notifications;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Blocks.Genesis.Entities.Data;

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
    [Route("objects")]
    public class ObjectController : ControllerBase
    {
        private readonly IObjectManagementService _objectManagementService;
        private readonly IObjectDiscoveryService _objectDiscoveryService;
        private readonly IFileDirectoryManagementService _directoryManagementService;
        private readonly IBuiltInNotificationSender? _notifier;

        public ObjectController(
            IObjectManagementService objectManagementService,
            IObjectDiscoveryService objectDiscoveryService,
            IFileDirectoryManagementService directoryManagementService,
            IBuiltInNotificationSender? notifier = null)
        {
            _objectManagementService = objectManagementService;
            _objectDiscoveryService = objectDiscoveryService;
            _directoryManagementService = directoryManagementService;
            _notifier = notifier;
        }

        /// <summary>
        /// Tells the affected user that access to a stored item was given or removed. Best effort: it never
        /// throws and never changes the response. Only a User principal gets it, and not the acting user.
        /// </summary>
        private async Task NotifyAccessChangedAsync(
            ObjectAccessOperationResult result, string resourceId, ObjectResourceType resourceType,
            ObjectPrincipalType principalType, string? principalId, string action)
        {
            if (_notifier is null || !result.IsSuccess || principalType != ObjectPrincipalType.User) return;
            var context = BlocksContext.GetContext();
            var recipients = BuiltInNotificationSender.Recipients(principalId);
            recipients.RemoveAll(u => string.Equals(u, context?.UserId, StringComparison.Ordinal));
            if (recipients.Count == 0) return;
            await _notifier.SendAsync(new BuiltInNotification(
                context?.TenantId ?? string.Empty,
                "data-storage-object-shared",
                recipients,
                new
                {
                    @event = "data-storage-object-shared",
                    title = action == "revoked" ? "Storage access removed" : "Storage access shared with you",
                    description = action == "revoked"
                        ? "Your access to a stored item was removed."
                        : "A stored item was shared with you.",
                    isSuccess = true,
                    resourceId,
                    resourceType = resourceType.ToString(),
                    action,
                    occurredAt = DateTime.UtcNow
                },
                OrganizationId: context?.OrganizationId));
        }

        /// <summary>Access-resolved, cursor-paginated files and directories under one parent.</summary>
        [HttpGet("get-objects")]
        [ProtectedEndPoint("blocks-data::object::get-objects")]
        [ValidateRequest]
        public async Task<IActionResult> GetObjects([FromQuery] GetObjectRequest request)
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
        [HttpGet("search-objects")]
        [ProtectedEndPoint("blocks-data::object::search-objects")]
        [ValidateRequest]
        public async Task<IActionResult> SearchObjects([FromQuery] ObjectSearchRequest request)
        {
            var page = await _objectDiscoveryService.SearchAsync(
                request.Query, request.DirectoryId, ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Archived directorys and files the caller may view.</summary>
        [HttpGet("get-trash")]
        [ProtectedEndPoint("blocks-data::object::get-trash")]
        [ValidateRequest]
        public async Task<IActionResult> GetTrash([FromQuery] TrashRequest request)
        {
            var page = await _objectDiscoveryService.GetTrashAsync(ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Live files and directorys explicitly shared with the caller.</summary>
        [HttpGet("get-shared-objects")]
        [ProtectedEndPoint("blocks-data::object::get-shared-objects")]
        [ValidateRequest]
        public async Task<IActionResult> GetSharedObjects([FromQuery] SharedObjectRequest request)
        {
            var page = await _objectDiscoveryService.GetSharedAsync(
                ObjectKind.FromApiString(request.Type), request.Cursor, request.Limit);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Returns an archived item to its original parent.</summary>
        [HttpPost("restore-from-trash")]
        [ProtectedEndPoint("blocks-data::object::restore-object")]
        [ValidateRequest]
        public async Task<IActionResult> RestoreFromTrash([FromBody] RestoreFromTrashRequest request)
        {
            var result = await _objectDiscoveryService.RestoreAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>Removes an archived item for good.</summary>
        [HttpPost("delete-from-trash")]
        [ProtectedEndPoint("blocks-data::object::delete-from-trash")]
        public async Task<IActionResult> DeleteFromTrash([FromBody] DeleteFromTrashRequest request)
        {
            var result = await _objectDiscoveryService.DeleteFromTrashAsync(request.ResourceId);

            return MapTrash(result, request.ResourceId);
        }

        /// <summary>The access entries on a resource.</summary>
        [HttpGet("get-access-policies")]
        [ProtectedEndPoint("blocks-data::object::get-access-policies")]
        public async Task<IActionResult> GetAccessPolicies([FromQuery] GetAccessPoliciesRequest request)
        {
            var policies = await _objectManagementService.GetAccessAsync(request.ResourceId);

            return Ok(policies.Select(AccessPolicyDto.From).ToList());
        }

        /// <summary>Creates an access entry. Requires Manage on the resource.</summary>
        [HttpPost("grant-access")]
        [ProtectedEndPoint("blocks-data::object::grant-access")]
        [ValidateRequest]
        public async Task<IActionResult> GrantAccess([FromBody] GrantAccessRequest request)
        {
            var result = await _objectManagementService.GrantAccessAsync(ToPolicy(request));
            await NotifyAccessChangedAsync(result, request.ResourceId, request.ResourceType, request.PrincipalType, request.PrincipalId, "shared");

            return MapAccess(result, created: true);
        }

        /// <summary>Updates an existing access entry.</summary>
        [HttpPost("update-access-policy")]
        [ProtectedEndPoint("blocks-data::object::update-access-policy")]
        [ValidateRequest]
        public async Task<IActionResult> UpdateAccessPolicy([FromBody] GrantAccessRequest request)
        {
            var result = await _objectManagementService.UpdateAccessAsync(ToPolicy(request));
            await NotifyAccessChangedAsync(result, request.ResourceId, request.ResourceType, request.PrincipalType, request.PrincipalId, "changed");

            return MapAccess(result, created: false);
        }

        /// <summary>Deletes an access entry.</summary>
        [HttpPost("revoke-access-policy")]
        [ProtectedEndPoint("blocks-data::object::revoke-access-policy")]
        [ValidateRequest]
        public async Task<IActionResult> RevokeAccessPolicy([FromBody] RevokeAccessRequest request)
        {
            var revoked = await FindUserPolicyAsync(request.ResourceId, request.PolicyItemId);
            var result = await _objectManagementService.RevokeAccessAsync(request.ResourceId, request.PolicyItemId);
            if (revoked is not null)
                await NotifyAccessChangedAsync(result, request.ResourceId, revoked.ResourceType, revoked.PrincipalType, revoked.PrincipalId, "revoked");

            return MapAccess(result, created: false);
        }

        /// <summary>The operations the calling user holds on a resource.</summary>
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
        [HttpPost("toggle-inheritance")]
        [ProtectedEndPoint("blocks-data::object::toggle-inheritance")]
        [ValidateRequest]
        public async Task<IActionResult> ToggleInheritance([FromBody] ToggleInheritanceRequest request)
        {
            var result = await _objectManagementService.ToggleInheritanceAsync(
                request.ResourceId, request.InheritsParentAccess);

            return MapAccess(result, created: false);
        }

        /// <summary>Grants a principal an allow entry and records it as a share.</summary>
        [HttpPost("share-object")]
        [ProtectedEndPoint("blocks-data::object::share-object")]
        [ValidateRequest]
        public async Task<IActionResult> ShareObject([FromBody] ShareObjectRequest request)
        {
            var result = await _objectManagementService.ShareObjectAsync(
                request.ResourceId, request.ResourceType, request.PrincipalType,
                request.PrincipalId, request.Permission, request.ExpiresAt, request.OrganizationId);
            await NotifyAccessChangedAsync(result, request.ResourceId, request.ResourceType, request.PrincipalType, request.PrincipalId, "shared");

            return MapAccess(result, created: true);
        }

        /// <summary>Shares several resources with several principals at one permission. All or nothing.</summary>
        [HttpPost("share-objects")]
        [ProtectedEndPoint("blocks-data::object::share-object")]
        public async Task<IActionResult> ShareObjects([FromBody] ShareObjectsRequest request)
        {
            var result = await _objectManagementService.ShareObjectsAsync(request);
            foreach (var policy in result.Policies)
                await NotifyAccessChangedAsync(ObjectAccessOperationResult.Success(policy.ItemId), policy.ResourceId,
                    policy.ResourceType, policy.PrincipalType, policy.PrincipalId, "shared");

            return MapShareBatch(result);
        }

        /// <summary>The access entry about to be removed, read first so its user can be told. Null when not found or on any error.</summary>
        private async Task<ObjectAccessPolicy?> FindUserPolicyAsync(string resourceId, string policyItemId)
        {
            if (_notifier is null) return null;
            try
            {
                var entries = await _objectManagementService.GetAccessAsync(resourceId);
                return entries.FirstOrDefault(p => string.Equals(p.ItemId, policyItemId, StringComparison.Ordinal));
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static ObjectAccessPolicy ToPolicy(GrantAccessRequest request) => new()
        {
            ItemId = request.PolicyItemId ?? string.Empty,
            ResourceId = request.ResourceId,
            ResourceType = request.ResourceType,
            PrincipalType = request.PrincipalType,
            PrincipalId = request.PrincipalId,
            OrganizationId = request.OrganizationId ?? BlocksContext.GetContext()?.OrganizationId ?? string.Empty,
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
            ObjectAccessOperationStatus.InvalidOrganizationScope =>
                BadRequest(new { message = "OrganizationId can only be used with a Role principal." }),
            ObjectAccessOperationStatus.WouldOrphanResource =>
                BadRequest(new { message = "Grant access on this resource before switching inheritance off." }),
            ObjectAccessOperationStatus.PolicyNotFound =>
                NotFound(new { message = "Access policy not found." }),
            _ => NotFound(new { message = "Resource not found." }),
        };

        private IActionResult MapShareBatch(ObjectShareBatchResult result) => result.Status switch
        {
            ObjectAccessOperationStatus.Succeeded => Ok(new
            {
                items = result.Policies.Select(p => new
                {
                    resourceId = p.ResourceId,
                    resourceType = p.ResourceType,
                    principalType = p.PrincipalType,
                    principalId = p.PrincipalId,
                    itemId = p.ItemId,
                }).ToList(),
            }),
            ObjectAccessOperationStatus.ResourceNotFound =>
                NotFound(new { message = "Resource not found.", resourceIds = result.FailedResourceIds }),
            ObjectAccessOperationStatus.InvalidRequest =>
                BadRequest(new { message = "The share request is invalid.", errors = result.Errors }),
            ObjectAccessOperationStatus.NotPermitted =>
                StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You cannot manage access on these resources.", resourceIds = result.FailedResourceIds }),
            _ => MapAccess(ObjectAccessOperationResult.Failure(result.Status), created: false),
        };

        private IActionResult MapTrash(TrashOperationResult result, string resourceId) => result.Status switch
        {
            TrashOperationStatus.Succeeded => Ok(new { resourceId }),
            TrashOperationStatus.NotPermitted => Forbid(),
            _ => NotFound(new { message = $"Resource not found in trash: {resourceId}" }),
        };
    }
}
