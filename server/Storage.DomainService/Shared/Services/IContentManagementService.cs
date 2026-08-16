using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public interface IContentManagementService
    {
        Task<ContentAccessOperationResult> GrantAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> UpdateAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> RevokeAccessAsync(string resourceId, string policyItemId, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> ShareContentAsync(string resourceId, ContentResourceType resourceType, ContentPrincipalType principalType, string? principalId, ContentPermission permission, DateTime? expiresAt = null, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> ToggleInheritanceAsync(string resourceId, bool inherits, CancellationToken cancellationToken = default);
        Task<ContentPermissionFlags?> ResolveAccessAsync(string resourceId, CancellationToken cancellationToken = default);
        Task<List<ContentAccessPolicy>> GetAccessAsync(string resourceId, CancellationToken cancellationToken = default);
    }
}
