using Blocks.Genesis.Entities.Data;
using DomainService.Configuration;
using MongoDB.Driver;

namespace Worker.Jobs;

/// <summary>One database the storage-config migration works on: a tenant DB or the seed DB.</summary>
public sealed record MigrationTarget(string Id, IMongoDatabase Database, StorageConfigScope Scope);

/// <summary>What one target holds now: its old docs (by name) and its <c>storage-config:</c> rows.</summary>
public sealed class MigrationTargetState
{
    public required MigrationTarget Target { get; init; }
    public required bool CollectionExists { get; init; }

    /// <summary>Docs by trimmed name; the first doc of a name (natural order) is the one the old app read.</summary>
    public required Dictionary<string, List<StorageConfiguration>> ByName { get; init; }
    public required int DocCount { get; init; }
    public required int NoNameCount { get; init; }
    public required Dictionary<string, StorageSettings> Rows { get; init; }
    public string TenantId => Target.Scope.ResolveTenantId();
}

/// <summary>Finds the targets of the storage-config migration and reads their state. Data access only.</summary>
public sealed class StorageConfigMigrationTargets
{
    private readonly IStorageConfigMigrationDatabases _databases;
    private readonly IStorageConfigurationStore _store;

    public StorageConfigMigrationTargets(IStorageConfigMigrationDatabases databases, IStorageConfigurationStore store)
    {
        _databases = databases;
        _store = store;
    }

    /// <summary>
    /// Every tenant with a DB (disabled too) and the seed DB (secrets in the root tenant). Tenants without a DB, and
    /// the seed when there is no root tenant, come back as skipped (id, result text, is it a problem).
    /// </summary>
    public async Task<(List<MigrationTarget> Targets, List<(string Id, string Result, bool IsProblem)> Skipped)> BuildAsync(CancellationToken cancellationToken)
    {
        var tenants = await _databases.GetTenantsAsync(cancellationToken);
        var targets = new List<MigrationTarget>();
        var skipped = new List<(string Id, string Result, bool IsProblem)>();
        foreach (var tenant in tenants)
        {
            if (!tenant.IsRootTenant && (string.IsNullOrWhiteSpace(tenant.DbConnectionString) || string.IsNullOrWhiteSpace(tenant.DbName)))
            {
                skipped.Add((tenant.TenantId, "skipped-no-db", false));
                continue;
            }

            var db = _databases.TenantDb(tenant);
            targets.Add(new MigrationTarget(tenant.TenantId, db, StorageConfigScope.ForDatabase(tenant.TenantId, db)));
        }

        var root = tenants.FirstOrDefault(t => t.IsRootTenant);
        if (root is null)
        {
            skipped.Add((StorageConfigMigrationJob.SeedTargetId, "no-root-tenant (seed secrets live in the root tenant)", true));
        }
        else
        {
            var seed = _databases.Seed;
            targets.Add(new MigrationTarget(StorageConfigMigrationJob.SeedTargetId, seed, StorageConfigScope.ForSeed(root.TenantId, seed)));
        }

        return (targets, skipped);
    }

    public async Task<MigrationTargetState> ReadAsync(MigrationTarget target, CancellationToken ct)
    {
        var (exists, docs) = await _databases.ReadLegacyAsync(target.Database, ct);

        var byName = new Dictionary<string, List<StorageConfiguration>>(StringComparer.Ordinal);
        var noName = 0;
        foreach (var doc in docs)
        {
            var name = StorageConfigurationKeys.NormalizeName(doc.Name);
            if (name.Length == 0)
            {
                noName++;
                continue;
            }

            if (!byName.TryGetValue(name, out var list))
                byName[name] = list = [];
            list.Add(doc);
        }

        var rows = await _store.GetAllSettingsAsync(target.Scope, ct);
        return new MigrationTargetState
        {
            Target = target,
            CollectionExists = exists,
            ByName = byName,
            DocCount = docs.Count,
            NoNameCount = noName,
            Rows = rows.GroupBy(r => StorageConfigurationKeys.NormalizeName(r.Name), StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal)
        };
    }

    public Task DropLegacyAsync(MigrationTarget target, CancellationToken ct) => _databases.DropLegacyAsync(target.Database, ct);
}
