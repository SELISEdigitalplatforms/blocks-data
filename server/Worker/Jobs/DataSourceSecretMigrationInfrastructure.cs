using Blocks.Genesis;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;
using StackExchange.Redis;

namespace Worker.Jobs;

/// <summary>One row of <c>BlocksRootDb.Tenants</c> (disabled tenants too).</summary>
public sealed record DscTenant(string TenantId, bool IsRootTenant, bool IsDisabled, string DbConnectionString, string DbName);

/// <summary>Databases the DSC migration job reads and writes (fake in tests).</summary>
public interface IDscMigrationDatabases
{
    IMongoDatabase Root { get; }

    Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken);

    /// <summary>The tenant DB; for the root tenant this is the root DB.</summary>
    IMongoDatabase TenantDb(DscTenant tenant);
}

/// <summary>Redis calls of the DSC migration job (fake in tests).</summary>
public interface IDscMigrationRedis
{
    Task<bool> TryLockAsync(string key, string token, TimeSpan ttl);
    Task ReleaseLockAsync(string key, string token);
    Task<Dictionary<string, string>> GetHashAsync(string key);

    /// <summary>One transaction: <c>HSET DbConnectionSecretId, Version</c> + <c>HDEL DbConnectionString</c>.</summary>
    Task<bool> ScrubAsync(string key, string secretId, string version);
}

public sealed class DscMigrationDatabases : IDscMigrationDatabases
{
    private readonly IDbContextProvider _dbContextProvider;
    private readonly IBlocksSecret _blocksSecret;

    public DscMigrationDatabases(IDbContextProvider dbContextProvider, IBlocksSecret blocksSecret)
    {
        _dbContextProvider = dbContextProvider;
        _blocksSecret = blocksSecret;
    }

    public IMongoDatabase Root =>
        _dbContextProvider.GetDatabase(_blocksSecret.DatabaseConnectionString, _blocksSecret.RootDatabaseName);

    public async Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken)
    {
        var docs = await Root.GetCollection<BsonDocument>("Tenants")
            .Find(new BsonDocument())
            .ToListAsync(cancellationToken);
        return docs.Select(d => new DscTenant(
                d.GetValue("TenantId", BsonString.Empty).ToString() ?? string.Empty,
                d.GetValue("IsRootTenant", false).ToBoolean(),
                d.GetValue("IsDisabled", false).ToBoolean(),
                d.GetValue("DbConnectionString", BsonString.Empty).ToString() ?? string.Empty,
                d.GetValue("DBName", BsonString.Empty).ToString() ?? string.Empty))
            .Where(t => !string.IsNullOrWhiteSpace(t.TenantId))
            .ToList();
    }

    public IMongoDatabase TenantDb(DscTenant tenant) =>
        tenant.IsRootTenant
            ? Root
            : _dbContextProvider.GetDatabase(tenant.DbConnectionString, tenant.DbName);
}

public sealed class DscMigrationRedis : IDscMigrationRedis
{
    private readonly ICacheClient _cacheClient;

    public DscMigrationRedis(ICacheClient cacheClient)
    {
        _cacheClient = cacheClient;
    }

    public Task<bool> TryLockAsync(string key, string token, TimeSpan ttl) =>
        _cacheClient.CacheDatabase().StringSetAsync(key, token, ttl, When.NotExists);

    public async Task ReleaseLockAsync(string key, string token)
    {
        var db = _cacheClient.CacheDatabase();
        var tran = db.CreateTransaction();
        tran.AddCondition(Condition.StringEqual(key, token));
        _ = tran.KeyDeleteAsync(key);
        await tran.ExecuteAsync();
    }

    public async Task<Dictionary<string, string>> GetHashAsync(string key)
    {
        var entries = await _cacheClient.GetHashValueAsync(key) ?? [];
        return entries.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString(), StringComparer.Ordinal);
    }

    public async Task<bool> ScrubAsync(string key, string secretId, string version)
    {
        var tran = _cacheClient.CacheDatabase().CreateTransaction();
        _ = tran.HashSetAsync(key, [
            new HashEntry(GqlDbRepository.HashFieldSecretId, secretId),
            new HashEntry(GqlDbRepository.HashFieldVersion, version)
        ]);
        _ = tran.HashDeleteAsync(key, GqlDbRepository.HashFieldLegacyConnectionString);
        return await tran.ExecuteAsync();
    }
}

internal static class DscMigrationConstants
{
    public const string CollectionName = "DataServiceConfigurations";
    public const string RootDbName = GraphQlConstant.BlocksRootDbName;
}
