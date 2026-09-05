using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public interface IObjectAccessResolver
    {
        /// <summary>True when the caller may perform <paramref name="operation"/> on the resource.</summary>
        Task<bool> ResolveAsync(ObjectResourceDescriptor resource, ObjectPermission operation, CancellationToken cancellationToken = default);

        /// <summary>Every operation the caller holds on the resource, resolved in one pass.</summary>
        Task<ObjectPermissionFlags> ResolveFlagsAsync(ObjectResourceDescriptor resource, CancellationToken cancellationToken = default);

        /// <summary>
        /// True when authoring a Deny for <paramref name="principalId"/> on this resource would
        /// deny a principal who owns it. The service rejects such a grant rather than storing
        /// an entry that resolution would then treat as void.
        /// </summary>
        Task<bool> WouldCreateSelfDenyAsync(ObjectResourceDescriptor resource, ObjectPrincipalType principalType, string? principalId, CancellationToken cancellationToken = default);
        Task<bool> WouldCreateSelfDenyAsync(ObjectResourceDescriptor resource, ObjectPrincipalType principalType, string? principalId, string? roleOrganizationId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Resolves a page of children against an already-resolved parent, without issuing
        /// one query per child. Returns the visible subset in the order supplied.
        /// </summary>
        Task<List<ObjectResourceDescriptor>> FilterVisibleAsync(IReadOnlyList<ObjectResourceDescriptor> children, CancellationToken cancellationToken = default);
    }
}
