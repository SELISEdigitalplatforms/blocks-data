using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public class ObjectAccessRepository : IObjectAccessRepository
    {
        internal const string PolicyCollectionName = "ObjectAccessPolicies";
        internal const string AuditCollectionName = "ObjectAuditLogs";

        private readonly IDbContextProvider _dbContextProvider;

        // Index creation is idempotent in Mongo, but issuing it on every call still costs a
        // round trip, so it is done once per repository instance per collection.
        private int _policyIndexesEnsured;
        private int _auditIndexesEnsured;

        public ObjectAccessRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        /// <summary>
        /// Entries are active when they are not expired. An entry with no expiry never
        /// expires, so the filter has to admit null rather than compare against it.
        /// </summary>
        private static FilterDefinition<ObjectAccessPolicy> Active(DateTime asOf)
        {
            var builder = Builders<ObjectAccessPolicy>.Filter;
            return builder.Eq(p => p.ExpiresAt, null) | builder.Gt(p => p.ExpiresAt, asOf);
        }

        private IMongoCollection<ObjectAccessPolicy> Policies =>
            _dbContextProvider.GetCollection<ObjectAccessPolicy>(PolicyCollectionName);

        private IMongoCollection<ObjectAuditLog> AuditLogs =>
            _dbContextProvider.GetCollection<ObjectAuditLog>(AuditCollectionName);

        private async Task EnsurePolicyIndexesAsync(CancellationToken cancellationToken)
        {
            if (Interlocked.Exchange(ref _policyIndexesEnsured, 1) == 1) return;

            var keys = Builders<ObjectAccessPolicy>.IndexKeys;
            await Policies.Indexes.CreateManyAsync(
                new[]
                {
                    // Serves both the single-resource read and the batched ancestor and
                    // children reads, which are the hot paths in resolution.
                    new CreateIndexModel<ObjectAccessPolicy>(
                        keys.Ascending(p => p.TenantId).Ascending(p => p.ResourceId)),
                    // Supports revoking every grant held by one principal.
                    new CreateIndexModel<ObjectAccessPolicy>(
                        keys.Ascending(p => p.TenantId).Ascending(p => p.PrincipalType)
                            .Ascending(p => p.PrincipalId).Ascending(p => p.OrganizationId)),
                },
                cancellationToken);
        }

        private async Task EnsureAuditIndexesAsync(CancellationToken cancellationToken)
        {
            if (Interlocked.Exchange(ref _auditIndexesEnsured, 1) == 1) return;

            var keys = Builders<ObjectAuditLog>.IndexKeys;
            await AuditLogs.Indexes.CreateOneAsync(
                new CreateIndexModel<ObjectAuditLog>(
                    keys.Ascending(a => a.TenantId).Ascending(a => a.ResourceId).Descending(a => a.CreatedDate)),
                cancellationToken: cancellationToken);
        }

        public async Task<List<ObjectAccessPolicy>> GetByResourceAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(resourceId)) return new List<ObjectAccessPolicy>();

            await EnsurePolicyIndexesAsync(cancellationToken);

            var filter = Active(DateTime.UtcNow)
                         & Builders<ObjectAccessPolicy>.Filter.Eq(p => p.ResourceId, resourceId);

            return await Policies.Find(filter).ToListAsync(cancellationToken);
        }

        public async Task<List<ObjectAccessPolicy>> GetByResourcesAsync(IEnumerable<string> resourceIds, CancellationToken cancellationToken = default)
        {
            var ids = Distinct(resourceIds);
            if (ids.Count == 0) return new List<ObjectAccessPolicy>();

            await EnsurePolicyIndexesAsync(cancellationToken);

            var filter = Active(DateTime.UtcNow)
                         & Builders<ObjectAccessPolicy>.Filter.In(p => p.ResourceId, ids);

            return await Policies.Find(filter).ToListAsync(cancellationToken);
        }

        public async Task<HashSet<string>> GetResourceIdsWithPoliciesAsync(IEnumerable<string> resourceIds, CancellationToken cancellationToken = default)
        {
            var ids = Distinct(resourceIds);
            if (ids.Count == 0) return new HashSet<string>(StringComparer.Ordinal);

            await EnsurePolicyIndexesAsync(cancellationToken);

            var filter = Active(DateTime.UtcNow)
                         & Builders<ObjectAccessPolicy>.Filter.In(p => p.ResourceId, ids);

            var found = await Policies.DistinctAsync(p => p.ResourceId, filter, cancellationToken: cancellationToken);
            var result = await found.ToListAsync(cancellationToken);
            return new HashSet<string>(result, StringComparer.Ordinal);
        }

        public async Task GrantAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(policy);
            await EnsurePolicyIndexesAsync(cancellationToken);
            await Policies.InsertOneAsync(policy, cancellationToken: cancellationToken);
        }

        public async Task UpdateAsync(ObjectAccessPolicy policy, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(policy);
            await EnsurePolicyIndexesAsync(cancellationToken);

            var filter = Builders<ObjectAccessPolicy>.Filter.Eq(p => p.ItemId, policy.ItemId);

            await Policies.ReplaceOneAsync(filter, policy, cancellationToken: cancellationToken);
        }

        public async Task<bool> RevokeAsync(string policyItemId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(policyItemId)) return false;

            var filter = Builders<ObjectAccessPolicy>.Filter.Eq(p => p.ItemId, policyItemId);

            var result = await Policies.DeleteOneAsync(filter, cancellationToken);
            return result.DeletedCount > 0;
        }

        public async Task<long> RevokeAllForResourceAsync(string resourceId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(resourceId)) return 0;

            var filter = Builders<ObjectAccessPolicy>.Filter.Eq(p => p.ResourceId, resourceId);

            var result = await Policies.DeleteManyAsync(filter, cancellationToken);
            return result.DeletedCount;
        }

        public async Task WriteAuditAsync(ObjectAuditLog entry, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(entry);
            await EnsureAuditIndexesAsync(cancellationToken);
            await AuditLogs.InsertOneAsync(entry, cancellationToken: cancellationToken);
        }

        public async Task<List<ObjectAuditLog>> GetAuditForResourceAsync(string resourceId, int limit = 100, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(resourceId)) return new List<ObjectAuditLog>();

            await EnsureAuditIndexesAsync(cancellationToken);

            var filter = Builders<ObjectAuditLog>.Filter.Eq(a => a.ResourceId, resourceId);

            return await AuditLogs.Find(filter)
                .SortByDescending(a => a.CreatedDate)
                .Limit(limit)
                .ToListAsync(cancellationToken);
        }

        private static List<string> Distinct(IEnumerable<string> ids) =>
            ids is null
                ? new List<string>()
                : ids.Where(id => !string.IsNullOrEmpty(id)).Distinct(StringComparer.Ordinal).ToList();
    }
}
