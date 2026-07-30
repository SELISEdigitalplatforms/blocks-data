using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public enum ContentAccessOperationStatus
    {
        Succeeded = 0,
        ResourceNotFound = 1,
        /// <summary>The caller does not hold Manage on the resource.</summary>
        NotPermitted = 2,
        /// <summary>The grant would deny a principal who owns the resource.</summary>
        SelfDenyRejected = 3,
        /// <summary>A Role, User or Organization grant was authored without a principal.</summary>
        PrincipalRequired = 4,
        /// <summary>Inheritance cannot be switched off while nothing else grants access.</summary>
        WouldOrphanResource = 5,
        PolicyNotFound = 6,
    }

    public sealed class ContentAccessOperationResult
    {
        public ContentAccessOperationStatus Status { get; init; }
        public string? PolicyItemId { get; init; }
        public bool IsSuccess => Status == ContentAccessOperationStatus.Succeeded;

        public static ContentAccessOperationResult Failure(ContentAccessOperationStatus status) => new() { Status = status };
        public static ContentAccessOperationResult Success(string? policyItemId = null) =>
            new() { Status = ContentAccessOperationStatus.Succeeded, PolicyItemId = policyItemId };
    }

    public interface IContentManagementService
    {
        Task<ContentAccessOperationResult> GrantAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> UpdateAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default);
        Task<ContentAccessOperationResult> RevokeAccessAsync(string resourceId, string policyItemId, CancellationToken cancellationToken = default);

        /// <summary>Grants a principal an allow entry and records it as a share.</summary>
        Task<ContentAccessOperationResult> ShareContentAsync(
            string resourceId, ContentResourceType resourceType, ContentPrincipalType principalType,
            string? principalId, ContentPermission permission, DateTime? expiresAt = null,
            CancellationToken cancellationToken = default);

        Task<ContentAccessOperationResult> ToggleInheritanceAsync(string resourceId, bool inherits, CancellationToken cancellationToken = default);

        Task<ContentPermissionFlags?> ResolveAccessAsync(string resourceId, CancellationToken cancellationToken = default);

        Task<List<ContentAccessPolicy>> GetAccessAsync(string resourceId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Access administration for folders and files: who may do what, and the audit trail
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
    public class ContentManagementService : IContentManagementService
    {
        private readonly IDbContextProvider _dbContextProvider;
        private readonly IContentAccessRepository _accessRepository;
        private readonly IContentAccessResolver _resolver;

        public ContentManagementService(
            IDbContextProvider dbContextProvider,
            IContentAccessRepository accessRepository,
            IContentAccessResolver resolver)
        {
            _dbContextProvider = dbContextProvider;
            _accessRepository = accessRepository;
            _resolver = resolver;
        }

        private static string TenantId => BlocksContext.GetContext()?.TenantId ?? string.Empty;
        private static string UserId => BlocksContext.GetContext()?.UserId ?? string.Empty;

        private IMongoCollection<Directory> Directories => _dbContextProvider.GetCollection<Directory>("Directories");
        private IMongoCollection<File> Files => _dbContextProvider.GetCollection<File>("Files");

        public async Task<ContentAccessOperationResult> GrantAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default)
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

            return ContentAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ContentAccessOperationResult> UpdateAccessAsync(ContentAccessPolicy policy, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(policy);

            var (resource, failure) = await AuthoriseManageAsync(policy.ResourceId, cancellationToken);
            if (failure is not null) return failure;

            var existing = (await _accessRepository.GetByResourceAsync(policy.ResourceId, cancellationToken))
                .FirstOrDefault(p => string.Equals(p.ItemId, policy.ItemId, StringComparison.Ordinal));

            if (existing is null) return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.PolicyNotFound);

            var rejection = await ValidatePolicyAsync(resource!, policy, cancellationToken);
            if (rejection is not null) return rejection;

            policy.TenantId = TenantId;
            policy.CreatedDate = existing.CreatedDate;
            policy.LastUpdatedDate = DateTime.UtcNow;
            policy.LastUpdatedBy = UserId;

            await _accessRepository.UpdateAsync(policy, cancellationToken);
            await AuditAsync(policy.ResourceId, policy.ResourceType, "Grant", true, DescribePrincipal(policy), cancellationToken);

            return ContentAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ContentAccessOperationResult> RevokeAccessAsync(string resourceId, string policyItemId, CancellationToken cancellationToken = default)
        {
            var (resource, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            if (failure is not null) return failure;

            var removed = await _accessRepository.RevokeAsync(policyItemId, cancellationToken);
            if (!removed) return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.PolicyNotFound);

            await AuditAsync(resourceId, ResourceTypeOf(resource!), "Revoke", true, policyItemId, cancellationToken);
            return ContentAccessOperationResult.Success(policyItemId);
        }

        public async Task<ContentAccessOperationResult> ShareContentAsync(
            string resourceId, ContentResourceType resourceType, ContentPrincipalType principalType,
            string? principalId, ContentPermission permission, DateTime? expiresAt = null,
            CancellationToken cancellationToken = default)
        {
            var policy = new ContentAccessPolicy
            {
                ItemId = Guid.NewGuid().ToString(),
                ResourceId = resourceId,
                ResourceType = resourceType,
                PrincipalType = principalType,
                PrincipalId = principalId,
                Permission = permission,
                Effect = ContentEffect.Allow,
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

            return ContentAccessOperationResult.Success(policy.ItemId);
        }

        public async Task<ContentAccessOperationResult> ToggleInheritanceAsync(string resourceId, bool inherits, CancellationToken cancellationToken = default)
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
                    p.Effect == ContentEffect.Allow
                    && (p.Permission == ContentPermission.Owner || p.Permission >= ContentPermission.View));

                if (!grantsSomething)
                {
                    return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.WouldOrphanResource);
                }
            }

            var updated = await SetInheritanceAsync(resource!, inherits, cancellationToken);
            if (!updated) return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.ResourceNotFound);

            await AuditAsync(resourceId, ResourceTypeOf(resource!), "Manage", true,
                $"InheritsParentAccess={inherits}", cancellationToken);

            return ContentAccessOperationResult.Success();
        }

        public async Task<ContentPermissionFlags?> ResolveAccessAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var resource = await FindResourceAsync(resourceId, cancellationToken);
            return resource is null ? null : await _resolver.ResolveFlagsAsync(resource.Descriptor, cancellationToken);
        }

        public async Task<List<ContentAccessPolicy>> GetAccessAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            var (_, failure) = await AuthoriseManageAsync(resourceId, cancellationToken);
            return failure is not null
                ? new List<ContentAccessPolicy>()
                : await _accessRepository.GetByResourceAsync(resourceId, cancellationToken);
        }

        /// <summary>
        /// Loads the resource and confirms the caller holds Manage. A denied attempt is
        /// audited, so the log answers who tried as well as who succeeded.
        /// </summary>
        private async Task<(ResourceHandle? Resource, ContentAccessOperationResult? Failure)> AuthoriseManageAsync(string resourceId, CancellationToken cancellationToken)
        {
            var resource = await FindResourceAsync(resourceId, cancellationToken);
            if (resource is null)
            {
                return (null, ContentAccessOperationResult.Failure(ContentAccessOperationStatus.ResourceNotFound));
            }

            if (!await _resolver.ResolveAsync(resource.Descriptor, ContentPermission.Manage, cancellationToken))
            {
                await AuditAsync(resourceId, resource.Type, "Manage", false, "denied", cancellationToken);
                return (null, ContentAccessOperationResult.Failure(ContentAccessOperationStatus.NotPermitted));
            }

            return (resource, null);
        }

        private async Task<ContentAccessOperationResult?> ValidatePolicyAsync(ResourceHandle resource, ContentAccessPolicy policy, CancellationToken cancellationToken)
        {
            // Everyone is the only principal kind that carries no id. For the others an
            // empty principal would either match nobody or, worse, be read as a wildcard.
            if (policy.PrincipalType != ContentPrincipalType.Everyone && string.IsNullOrWhiteSpace(policy.PrincipalId))
            {
                return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.PrincipalRequired);
            }

            if (policy.Effect == ContentEffect.Deny
                && await _resolver.WouldCreateSelfDenyAsync(resource.Descriptor, policy.PrincipalType, policy.PrincipalId, cancellationToken))
            {
                return ContentAccessOperationResult.Failure(ContentAccessOperationStatus.SelfDenyRejected);
            }

            return null;
        }

        private async Task<bool> SetInheritanceAsync(ResourceHandle resource, bool inherits, CancellationToken cancellationToken)
        {
            if (resource.Type == ContentResourceType.Folder)
            {
                var result = await Directories.UpdateOneAsync(
                    Builders<Directory>.Filter.Eq(d => d.TenantId, TenantId) & Builders<Directory>.Filter.Eq(d => d.ItemId, resource.Descriptor.ResourceId),
                    Builders<Directory>.Update.Set(d => d.InheritsParentAccess, inherits).Set(d => d.LastUpdatedDate, DateTime.UtcNow),
                    cancellationToken: cancellationToken);

                return result.MatchedCount > 0;
            }

            var fileResult = await Files.UpdateOneAsync(
                Builders<File>.Filter.Eq(f => f.TenantId, TenantId) & Builders<File>.Filter.Eq(f => f.ItemId, resource.Descriptor.ResourceId),
                Builders<File>.Update.Set(f => f.InheritsParentAccess, inherits).Set(f => f.LastUpdatedDate, DateTime.UtcNow),
                cancellationToken: cancellationToken);

            return fileResult.MatchedCount > 0;
        }

        private async Task<ResourceHandle?> FindResourceAsync(string resourceId, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(resourceId)) return null;

            var folder = await Directories
                .Find(Builders<Directory>.Filter.Eq(d => d.TenantId, TenantId) & Builders<Directory>.Filter.Eq(d => d.ItemId, resourceId))
                .FirstOrDefaultAsync(cancellationToken);

            if (folder is not null)
            {
                return new ResourceHandle(ContentResourceType.Folder, new ContentResourceDescriptor
                {
                    ResourceId = folder.ItemId,
                    AncestorIds = folder.AncestorIds ?? new(),
                    InheritsParentAccess = folder.InheritsParentAccess,
                    CreatedBy = folder.CreatedBy,
                });
            }

            var file = await Files
                .Find(Builders<File>.Filter.Eq(f => f.TenantId, TenantId) & Builders<File>.Filter.Eq(f => f.ItemId, resourceId))
                .FirstOrDefaultAsync(cancellationToken);

            return file is null
                ? null
                : new ResourceHandle(ContentResourceType.File, new ContentResourceDescriptor
                {
                    ResourceId = file.ItemId,
                    AncestorIds = file.AncestorIds ?? new(),
                    InheritsParentAccess = file.InheritsParentAccess,
                    CreatedBy = file.CreatedBy,
                });
        }

        private Task AuditAsync(string resourceId, ContentResourceType resourceType, string action, bool granted, string? detail, CancellationToken cancellationToken) =>
            _accessRepository.WriteAuditAsync(new ContentAuditLog
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

        private static ContentResourceType ResourceTypeOf(ResourceHandle resource) => resource.Type;

        private static string DescribePrincipal(ContentAccessPolicy policy) =>
            $"{policy.Effect} {policy.Permission} to {policy.PrincipalType}"
            + (string.IsNullOrEmpty(policy.PrincipalId) ? string.Empty : $" {policy.PrincipalId}");

        private sealed record ResourceHandle(ContentResourceType Type, ContentResourceDescriptor Descriptor);
    }
}
