using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public interface IObjectManagementService
    {
        Task<ObjectAccessOperationResult> GrantAccessAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ObjectAccessOperationResult> UpdateAccessAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ObjectAccessOperationResult> RevokeAccessAsync(string resourceId, string policyItemId, CancellationToken cancellationToken = default);
        Task<ObjectAccessOperationResult> ShareObjectAsync(string resourceId, ObjectResourceType resourceType, ObjectPrincipalType principalType, string? principalId, ObjectPermission permission, DateTime? expiresAt = null, CancellationToken cancellationToken = default);
        Task<ObjectAccessOperationResult> ShareObjectAsync(string resourceId, ObjectResourceType resourceType, ObjectPrincipalType principalType, string? principalId, ObjectPermission permission, DateTime? expiresAt, string? organizationId, CancellationToken cancellationToken = default);
        Task<ObjectAccessOperationResult> ToggleInheritanceAsync(string resourceId, bool inherits, CancellationToken cancellationToken = default);
        Task<ObjectPermissionFlags?> ResolveAccessAsync(string resourceId, CancellationToken cancellationToken = default);
        Task<List<ObjectAccessPolicy>> GetAccessAsync(string resourceId, CancellationToken cancellationToken = default);
    }
}
