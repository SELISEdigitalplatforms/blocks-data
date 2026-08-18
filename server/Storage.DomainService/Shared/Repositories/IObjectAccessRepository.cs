using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Storage for DMS access control entries and the audit trail. Every query is scoped
    /// to the tenant on the ambient context; callers never pass a tenant id.
    /// </summary>
    public interface IObjectAccessRepository
    {
        /// <summary>Active entries authored directly on one resource.</summary>
        Task<List<ObjectAccessPolicy>> GetByResourceAsync(string resourceId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Active entries for several resources in one round trip. Used to build a
        /// resource's ancestor chain, and to resolve a page of children, without issuing
        /// one query per resource.
        /// </summary>
        Task<List<ObjectAccessPolicy>> GetByResourcesAsync(IEnumerable<string> resourceIds, CancellationToken cancellationToken = default);

        /// <summary>
        /// Which of the given resources carry at least one entry of their own. Answers the
        /// listing partition question without fetching the entries themselves.
        /// </summary>
        Task<HashSet<string>> GetResourceIdsWithPoliciesAsync(IEnumerable<string> resourceIds, CancellationToken cancellationToken = default);

        Task GrantAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default);

        Task UpdateAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default);

        /// <summary>Removes one entry. Returns false when it did not exist.</summary>
        Task<bool> RevokeAsync(string policyItemId, CancellationToken cancellationToken = default);

        /// <summary>Removes every entry authored on a resource, for use when it is deleted.</summary>
        Task<long> RevokeAllForResourceAsync(string resourceId, CancellationToken cancellationToken = default);

        Task WriteAuditAsync(ObjectAuditLog entry, CancellationToken cancellationToken = default);

        Task<List<ObjectAuditLog>> GetAuditForResourceAsync(string resourceId, int limit = 100, CancellationToken cancellationToken = default);
    }
}
