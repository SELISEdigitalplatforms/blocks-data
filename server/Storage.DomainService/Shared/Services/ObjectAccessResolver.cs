using Blocks.Genesis;
using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Implements the effective-policy resolution described in the DMS specification.
    /// The only IO is fetching access entries; every decision is taken in memory.
    /// </summary>
    public class ObjectAccessResolver : IObjectAccessResolver
    {
        private readonly IObjectAccessRepository _repository;

        public ObjectAccessResolver(IObjectAccessRepository repository)
        {
            _repository = repository;
        }

        public async Task<bool> ResolveAsync(ObjectResourceDescriptor resource, ObjectPermission operation, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(resource);

            if (IsImpersonated() || IsOwnerByCreation(resource)) return true;

            var candidates = await BuildCandidatesAsync(resource, cancellationToken);
            return Decide(candidates, operation);
        }

        public async Task<ObjectPermissionFlags> ResolveFlagsAsync(ObjectResourceDescriptor resource, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(resource);

            if (IsImpersonated() || IsOwnerByCreation(resource)) return AllPermissions();

            var candidates = await BuildCandidatesAsync(resource, cancellationToken);
            return FlagsFrom(candidates);
        }

        public async Task<bool> WouldCreateSelfDenyAsync(ObjectResourceDescriptor resource, ObjectPrincipalType principalType, string? principalId, CancellationToken cancellationToken = default)
        {
            return await WouldCreateSelfDenyAsync(resource, principalType, principalId, null, cancellationToken);
        }

        public async Task<bool> WouldCreateSelfDenyAsync(ObjectResourceDescriptor resource, ObjectPrincipalType principalType, string? principalId, string? organizationId, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(resource);

            // A Deny aimed at a specific user is a self-deny when that user created the
            // resource, or already holds an explicit Owner entry on it.
            if (principalType == ObjectPrincipalType.User
                && !string.IsNullOrEmpty(principalId)
                && string.Equals(resource.CreatedBy, principalId, StringComparison.Ordinal))
            {
                return true;
            }

            var own = await _repository.GetByResourceAsync(resource.ResourceId, cancellationToken);
            return own.Any(p =>
                p.Permission == ObjectPermission.Owner
                && p.Effect == ObjectEffect.Allow
                && p.PrincipalType == principalType
                && string.Equals(p.PrincipalId, principalId, StringComparison.Ordinal)
                && string.Equals(RoleOrganizationScope(p), NormalizeOrganizationScope(organizationId), StringComparison.Ordinal));
        }

        public async Task<List<ObjectResourceDescriptor>> FilterVisibleAsync(IReadOnlyList<ObjectResourceDescriptor> children, CancellationToken cancellationToken = default)
        {
            if (children is null || children.Count == 0) return new List<ObjectResourceDescriptor>();

            if (IsImpersonated()) return children.ToList();

            var context = BlocksContext.GetContext();
            var userId = context?.UserId;

            // One probe answers the partition question for the whole page. Children that
            // inherit and carry no entries of their own cannot be more restricted than the
            // parent the caller already reached, so they need no resolution.
            var withOwnPolicies = await _repository.GetResourceIdsWithPoliciesAsync(
                children.Select(c => c.ResourceId), cancellationToken);

            var needsResolution = children
                .Where(c => !IsOwnerByCreation(c, userId))
                .Where(c => !c.InheritsParentAccess || withOwnPolicies.Contains(c.ResourceId))
                .ToList();

            // One batched fetch covers every entry those children could consult, their own
            // and their ancestors', so resolution below touches no further IO.
            var policiesById = await FetchPoliciesAsync(
                needsResolution.SelectMany(RelevantResourceIds), cancellationToken);

            var visible = new List<ObjectResourceDescriptor>();
            foreach (var child in children)
            {
                if (IsOwnerByCreation(child, userId))
                {
                    visible.Add(child);
                    continue;
                }

                if (child.InheritsParentAccess && !withOwnPolicies.Contains(child.ResourceId))
                {
                    visible.Add(child);
                    continue;
                }

                var candidates = BuildCandidates(child, policiesById);
                if (Decide(candidates, ObjectPermission.View)) visible.Add(child);
            }

            return visible;
        }

        /// <summary>
        /// Ordered nearest first: the resource itself, then its ancestors from immediate
        /// parent outwards. Nearest wins during de-duplication, so order is significant.
        /// </summary>
        private static IEnumerable<string> RelevantResourceIds(ObjectResourceDescriptor resource)
        {
            yield return resource.ResourceId;

            if (!resource.InheritsParentAccess) yield break;

            // AncestorIds is stored root first, so walking backwards yields nearest first.
            for (var i = resource.AncestorIds.Count - 1; i >= 0; i--)
            {
                yield return resource.AncestorIds[i];
            }
        }

        private async Task<Dictionary<string, List<ObjectAccessPolicy>>> FetchPoliciesAsync(IEnumerable<string> resourceIds, CancellationToken cancellationToken)
        {
            var ids = resourceIds.Where(id => !string.IsNullOrEmpty(id)).Distinct(StringComparer.Ordinal).ToList();
            if (ids.Count == 0) return new Dictionary<string, List<ObjectAccessPolicy>>(StringComparer.Ordinal);

            var policies = await _repository.GetByResourcesAsync(ids, cancellationToken);

            return policies
                .GroupBy(p => p.ResourceId, StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);
        }

        private async Task<List<ObjectAccessPolicy>> BuildCandidatesAsync(ObjectResourceDescriptor resource, CancellationToken cancellationToken)
        {
            var policiesById = await FetchPoliciesAsync(RelevantResourceIds(resource), cancellationToken);
            return BuildCandidates(resource, policiesById);
        }

        /// <summary>
        /// Collects the entries that apply, keeping only the nearest entry for each
        /// (principal type, principal id, permission) triple. Priority breaks ties within
        /// one resource; distance decides between resources.
        /// </summary>
        private static List<ObjectAccessPolicy> BuildCandidates(
            ObjectResourceDescriptor resource,
            IReadOnlyDictionary<string, List<ObjectAccessPolicy>> policiesById)
        {
            var winners = new Dictionary<(ObjectPrincipalType, string, string, ObjectPermission), ObjectAccessPolicy>();

            foreach (var resourceId in RelevantResourceIds(resource))
            {
                if (!policiesById.TryGetValue(resourceId, out var policies)) continue;

                foreach (var policy in policies)
                {
                    var key = (policy.PrincipalType, policy.PrincipalId ?? string.Empty,
                        RoleOrganizationScope(policy), policy.Permission);

                    if (!winners.TryGetValue(key, out var existing))
                    {
                        winners[key] = policy;
                        continue;
                    }

                    // A nearer resource has already claimed this key, and distance outranks
                    // priority. Only break ties when both entries sit on the same resource.
                    if (string.Equals(existing.ResourceId, policy.ResourceId, StringComparison.Ordinal)
                        && policy.Priority > existing.Priority)
                    {
                        winners[key] = policy;
                    }
                }
            }

            return winners.Values.ToList();
        }

        private static bool Decide(IReadOnlyCollection<ObjectAccessPolicy> candidates, ObjectPermission operation)
        {
            // Resources without an access policy are public. This is equivalent to an
            // implicit Everyone Allow at every permission level, but does not persist a
            // synthetic entry or interfere with an explicit policy when one exists.
            if (candidates.Count == 0) return true;

            var context = BlocksContext.GetContext();

            var matching = candidates
                .Where(p => MatchesPrincipal(p, context))
                .Where(p => Satisfies(p.Permission, operation))
                .ToList();

            // An explicit Owner grant carries every operation and voids Deny entries for
            // that principal, matching the owner rule applied before resolution starts.
            if (matching.Any(p => p.Permission == ObjectPermission.Owner && p.Effect == ObjectEffect.Allow))
            {
                return true;
            }

            if (matching.Any(p => p.Effect == ObjectEffect.Deny)) return false;

            return matching.Any(p => p.Effect == ObjectEffect.Allow);
        }

        private static ObjectPermissionFlags FlagsFrom(IReadOnlyCollection<ObjectAccessPolicy> candidates) => new()
        {
            CanView = Decide(candidates, ObjectPermission.View),
            CanDownload = Decide(candidates, ObjectPermission.Download),
            CanEdit = Decide(candidates, ObjectPermission.Edit),
            CanDelete = Decide(candidates, ObjectPermission.Delete),
            CanManage = Decide(candidates, ObjectPermission.Manage),
            CanOwner = Decide(candidates, ObjectPermission.Owner),
        };

        /// <summary>
        /// A held permission satisfies every operation at or below it in the hierarchy,
        /// which is what the numeric ordering of <see cref="ObjectPermission"/> encodes.
        /// </summary>
        private static bool Satisfies(ObjectPermission held, ObjectPermission requested) => held >= requested;

        private static bool MatchesPrincipal(ObjectAccessPolicy policy, BlocksContext? context) => policy.PrincipalType switch
        {
            ObjectPrincipalType.Everyone => true,
            ObjectPrincipalType.User => !string.IsNullOrEmpty(policy.PrincipalId)
                                         && string.Equals(policy.PrincipalId, context?.UserId, StringComparison.Ordinal),
            ObjectPrincipalType.Role => !string.IsNullOrEmpty(policy.PrincipalId)
                                         && context?.Roles is not null
                                         && context.Roles.Contains(policy.PrincipalId, StringComparer.Ordinal)
                                         && (string.IsNullOrEmpty(RoleOrganizationScope(policy))
                                             || string.Equals(policy.OrganizationId, context.OrganizationId, StringComparison.Ordinal)),
            // Only the caller's active organization matches. A missing active org never does,
            // so an entry authored with an empty principal cannot grant access by accident.
            ObjectPrincipalType.Organization => !string.IsNullOrEmpty(policy.PrincipalId)
                                                 && !string.IsNullOrEmpty(context?.OrganizationId)
                                                 && string.Equals(policy.PrincipalId, context.OrganizationId, StringComparison.Ordinal),
            _ => false,
        };

        private static string RoleOrganizationScope(ObjectAccessPolicy policy) =>
            policy.PrincipalType == ObjectPrincipalType.Role
                ? NormalizeOrganizationScope(policy.OrganizationId)
                : string.Empty;

        // BaseEntity historically initializes OrganizationId to "default". Existing role
        // entries therefore use that value for the original tenant-wide/global behaviour.
        private static string NormalizeOrganizationScope(string? organizationId) =>
            string.IsNullOrWhiteSpace(organizationId)
            || string.Equals(organizationId, "default", StringComparison.OrdinalIgnoreCase)
                ? string.Empty
                : organizationId;

        // Impersonated sessions act with the impersonated user's own full access, so
        // policy resolution is skipped rather than evaluated against the acting principal.
        private static bool IsImpersonated() => BlocksContext.GetContext()?.Impersonated == true;

        private static bool IsOwnerByCreation(ObjectResourceDescriptor resource) =>
            IsOwnerByCreation(resource, BlocksContext.GetContext()?.UserId);

        private static bool IsOwnerByCreation(ObjectResourceDescriptor resource, string? userId) =>
            !string.IsNullOrEmpty(userId) && string.Equals(resource.CreatedBy, userId, StringComparison.Ordinal);

        private static ObjectPermissionFlags AllPermissions() => new()
        {
            CanView = true,
            CanDownload = true,
            CanEdit = true,
            CanDelete = true,
            CanManage = true,
            CanOwner = true,
        };
    }
}
