using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    /// <summary>
    /// Access administration for directorys and files: who may do what, and the audit trail
    /// behind every change.
    /// </summary>
    /// <remarks>
    /// Two rules are enforced here rather than in the resolver, because they are about
    /// what may be written rather than how a stored entry is read. A deny aimed at an
    /// owner is refused instead of stored, since resolution would treat it as void and
    /// leave an entry that appears to do something it does not. And inheritance cannot be
    /// switched off unless something else already grants access, since otherwise the
    /// resource becomes invisible to everyone including the person switching it.
    /// </remarks>
    public class ObjectManagementService : IObjectManagementService
    {
        private readonly IDbContextProvider _dbContextProvider;
        private readonly IObjectAccessRepository _accessRepository;
        private readonly IObjectAccessResolver _resolver;
        private readonly IObjectItemWriter? _objectItems;

        public ObjectManagementService(
            IDbContextProvider dbContextProvider,
            IObjectAccessRepository accessRepository,
            IObjectAccessResolver resolver, IObjectItemWriter? objectItems = null)
        {
            _dbContextProvider = dbContextProvider;
            _accessRepository = accessRepository;
            _resolver = resolver;
            _objectItems = objectItems;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<FileDirectory> Directories => _dbContextProvider.GetCollection<FileDirectory>("FileDirectories");
        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");

        public async Task<ObjectAccessOperationResult> GrantAccessAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(policy);

            var (resource, failure) = await AuthoriseManageAsync(policy.ResourceId, cancellationToken);
            if (failure is not null) return failure;

            var rejection = await ValidatePolicyAsync(resource!, policy, cancellationToken);
            if (rejection is not null) return rejection;

            policy.TenantId = TenantId;
            policy.GrantedBy = UserId;
            if (string.IsNullOrEmpty(policy.ItemId)) policy.ItemId = Guid.NewGuid().ToString();
            policy.CreatedDate = policy.CreatedDate == default ? DateTime.UtcNow : policy.CreatedDate;

            await _accessRepository.GrantAsync(policy, cancellationToken);
            await AuditAsync(policy.ResourceId, policy.ResourceType, "Grant", true, DescribePrincipal(policy), cancellationToken);

            return ObjectAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ObjectAccessOperationResult> UpdateAccessAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(policy);

            var (resource, failure) = await AuthoriseManageAsync(policy.ResourceId, cancellationToken);
            if (failure is not null) return failure;

            var existing = (await _accessRepository.GetByResourceAsync(policy.ResourceId, cancellationToken))
                .FirstOrDefault(p => string.Equals(p.ItemId, policy.ItemId, StringComparison.Ordinal));

            if (existing is null) return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.PolicyNotFound);

            var rejection = await ValidatePolicyAsync(resource!, policy, cancellationToken);
            if (rejection is not null) return rejection;

            policy.TenantId = TenantId;
            policy.CreatedDate = existing.CreatedDate;
            policy.LastUpdatedDate = DateTime.UtcNow;
            policy.LastUpdatedBy = UserId;

            await _accessRepository.UpdateAsync(policy, cancellationToken);
            await AuditAsync(policy.ResourceId, policy.ResourceType, "Grant", true, DescribePrincipal(policy), cancellationToken);

            return ObjectAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ObjectAccessOperationResult> RevokeAccessAsync(string resourceId, string policyItemId, CancellationToken cancellationToken = default)
        {
            var (resource, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            if (failure is not null) return failure;

            var removed = await _accessRepository.RevokeAsync(policyItemId, cancellationToken);
            if (!removed) return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.PolicyNotFound);

            await AuditAsync(resourceId, ResourceTypeOf(resource!), "Revoke", true, policyItemId, cancellationToken);
            return ObjectAccessOperationResult.Success(policyItemId);
        }

        public async Task<ObjectAccessOperationResult> ShareObjectAsync(
            string resourceId, ObjectResourceType resourceType, ObjectPrincipalType principalType,
            string? principalId, ObjectPermission permission, DateTime? expiresAt = null,
            CancellationToken cancellationToken = default)
        {
            var policy = new ObjectAccessPolicy
            {
                ItemId = Guid.NewGuid().ToString(),
                ResourceId = resourceId,
                ResourceType = resourceType,
                PrincipalType = principalType,
                PrincipalId = principalId,
                Permission = permission,
                Effect = ObjectEffect.Allow,
                ExpiresAt = expiresAt,
            };

            var (resource, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            if (failure is not null) return failure;

            var rejection = await ValidatePolicyAsync(resource!, policy, cancellationToken);
            if (rejection is not null) return rejection;

            policy.TenantId = TenantId;
            policy.GrantedBy = UserId;
            policy.CreatedDate = DateTime.UtcNow;

            await _accessRepository.GrantAsync(policy, cancellationToken);
            // Recorded as a share rather than a grant so the audit distinguishes handing
            // access to someone from an administrator adjusting policy.
            await AuditAsync(resourceId, resourceType, "Share", true, DescribePrincipal(policy), cancellationToken);

            return ObjectAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ObjectAccessOperationResult> ToggleInheritanceAsync(string resourceId, bool inherits, CancellationToken cancellationToken = default)
        {
            var (resource, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            if (failure is not null) return failure;

            if (!inherits)
            {
                // Cutting a resource off from its ancestors leaves only its own entries.
                // If none of them grant anything, the resource disappears for everyone,
                // including whoever just made the change.
                var own = await _accessRepository.GetByResourceAsync(resourceId, cancellationToken);
                var grantsSomething = own.Any(p =>
                    p.Effect == ObjectEffect.Allow
                    && (p.Permission == ObjectPermission.Owner || p.Permission >= ObjectPermission.View));

                if (!grantsSomething)
                {
                    return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.WouldOrphanResource);
                }
            }

            var updated = await SetInheritanceAsync(resource!, inherits, cancellationToken);
            if (!updated) return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.ResourceNotFound);
            if (_objectItems is not null) await _objectItems.SetInheritanceAsync(resourceId, inherits, cancellationToken);

            await AuditAsync(resourceId, ResourceTypeOf(resource!), "Manage", true,
                $"InheritsParentAccess={inherits}", cancellationToken);

            return ObjectAccessOperationResult.Success();
        }

        public async Task<ObjectPermissionFlags?> ResolveAccessAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var resource = await FindResourceAsync(resourceId, cancellationToken);
            return resource is null ? null : await _resolver.ResolveFlagsAsync(resource.Descriptor, cancellationToken);
        }

        public async Task<List<ObjectAccessPolicy>> GetAccessAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var (_, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            return failure is not null
                ? new List<ObjectAccessPolicy>()
                : await _accessRepository.GetByResourceAsync(resourceId, cancellationToken);
        }

        /// <summary>
        /// Loads the resource and confirms the caller holds Manage. A denied attempt is
        /// audited, so the log answers who tried as well as who succeeded.
        /// </summary>
        private async Task<(ResourceHandle? Resource, ObjectAccessOperationResult? Failure)> AuthoriseManageAsync(string resourceId, CancellationToken cancellationToken)
        {
            var resource = await FindResourceAsync(resourceId, cancellationToken);
            if (resource is null)
            {
                return (null, ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.ResourceNotFound));
            }

            if (!await _resolver.ResolveAsync(resource.Descriptor, ObjectPermission.Manage, cancellationToken))
            {
                await AuditAsync(resourceId, resource.Type, "Manage", false, "denied", cancellationToken);
                return (null, ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.NotPermitted));
            }

            return (resource, null);
        }

        private async Task<ObjectAccessOperationResult?> ValidatePolicyAsync(ResourceHandle resource, ObjectAccessPolicy policy, CancellationToken cancellationToken)
        {
            // Everyone is the only principal kind that carries no id. For the others an
            // empty principal would either match nobody or, worse, be read as a wildcard.
            if (policy.PrincipalType != ObjectPrincipalType.Everyone && string.IsNullOrWhiteSpace(policy.PrincipalId))
            {
                return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.PrincipalRequired);
            }

            if (policy.Effect == ObjectEffect.Deny
                && await _resolver.WouldCreateSelfDenyAsync(resource.Descriptor, policy.PrincipalType, policy.PrincipalId, cancellationToken))
            {
                return ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.SelfDenyRejected);
            }

            return null;
        }

        private async Task<bool> SetInheritanceAsync(ResourceHandle resource, bool inherits, CancellationToken cancellationToken)
        {
            if (resource.Type == ObjectResourceType.Directory)
            {
                var result = await Directories.UpdateOneAsync(
                    Builders<FileDirectory>.Filter.Eq(d => d.ItemId, resource.Descriptor.ResourceId),
                    Builders<FileDirectory>.Update.Set(d => d.InheritsParentAccess, inherits).Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                    cancellationToken: cancellationToken);

                return result.MatchedCount > 0;
            }

            var fileResult = await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.ItemId, resource.Descriptor.ResourceId),
                Builders<File>.Update.Set(f => f.InheritsParentAccess, inherits).Set(f => f.LastUpdatedDate, DateTime.UtcNow),
                cancellationToken: cancellationToken);

            return fileResult.MatchedCount > 0;
        }

        private async Task<ResourceHandle?> FindResourceAsync(string resourceId, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(resourceId)) return null;

            var directory = await Directories
                .Find(Builders<FileDirectory>.Filter.Eq(d => d.ItemId, resourceId))
                .FirstOrDefaultAsync(cancellationToken);

            if (directory is not null)
            {
                return new ResourceHandle(ObjectResourceType.Directory, new ObjectResourceDescriptor
                {
                    ResourceId = directory.ItemId,
                    AncestorIds = directory.AncestorIds ?? new(),
                    InheritsParentAccess = directory.InheritsParentAccess,
                    CreatedBy = directory.CreatedBy,
                });
            }

            var file = await Files
                .Find(Builders<File>.Filter.Eq(f => f.ItemId, resourceId))
                .FirstOrDefaultAsync(cancellationToken);

            return file is null
                ? null
                : new ResourceHandle(ObjectResourceType.File, new ObjectResourceDescriptor
                {
                    ResourceId = file.ItemId,
                    AncestorIds = file.AncestorIds ?? new(),
                    InheritsParentAccess = file.InheritsParentAccess,
                    CreatedBy = file.CreatedBy,
                });
        }

        private Task AuditAsync(string resourceId, ObjectResourceType resourceType, string action, bool granted, string? detail, CancellationToken cancellationToken) =>
            _accessRepository.WriteAuditAsync(new ObjectAuditLog
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = TenantId,
                ResourceId = resourceId,
                ResourceType = resourceType,
                UserId = UserId,
                Action = action,
                Granted = granted,
                Detail = detail,
                CreatedDate = DateTime.UtcNow,
                CreatedBy = UserId,
            }, cancellationToken);

        private static ObjectResourceType ResourceTypeOf(ResourceHandle resource) => resource.Type;

        private static string DescribePrincipal(ObjectAccessPolicy policy) =>
            $"{policy.Effect} {policy.Permission} to {policy.PrincipalType}"
            + (string.IsNullOrEmpty(policy.PrincipalId) ? string.Empty : $" {policy.PrincipalId}");

        private sealed record ResourceHandle(ObjectResourceType Type, ObjectResourceDescriptor Descriptor);
    }
}
