using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DomainService.Configuration;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Worker.Jobs;

/// <summary>Databases the storage-config migration job reads and writes (fake in tests).</summary>
public interface IStorageConfigMigrationDatabases
{
    /// <summary>Every row of <c>BlocksRootDb.Tenants</c> (disabled tenants too).</summary>
    Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken);

    /// <summary>The tenant DB; for the root tenant this is the root DB.</summary>
    IMongoDatabase TenantDb(DscTenant tenant);

    /// <summary>The seed DB <c>BlocksConfiguration</c> (copied into new projects).</summary>
    IMongoDatabase Seed { get; }

    /// <summary>Whether <c>StorageConfigurations</c> exists in <paramref name="database"/>, and all its docs (natural order).</summary>
    Task<(bool Exists, List<StorageConfiguration> Docs)> ReadLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken);

    /// <summary>Drops <c>StorageConfigurations</c> in <paramref name="database"/>.</summary>
    Task DropLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken);
}

public sealed class StorageConfigMigrationDatabases : IStorageConfigMigrationDatabases
{
    public const string SeedDatabaseName = "BlocksConfiguration";

    private readonly IDscMigrationDatabases _databases;
    private readonly IDbContextProvider _dbContextProvider;
    private readonly IBlocksSecret _blocksSecret;

    public StorageConfigMigrationDatabases(IDscMigrationDatabases databases, IDbContextProvider dbContextProvider, IBlocksSecret blocksSecret)
    {
        _databases = databases;
        _dbContextProvider = dbContextProvider;
        _blocksSecret = blocksSecret;
    }

    public Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken) => _databases.GetTenantsAsync(cancellationToken);

    public IMongoDatabase TenantDb(DscTenant tenant) => _databases.TenantDb(tenant);

    public IMongoDatabase Seed => _dbContextProvider.GetDatabase(_blocksSecret.DatabaseConnectionString, SeedDatabaseName);

    public Task<(bool Exists, List<StorageConfiguration> Docs)> ReadLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken) =>
        StorageConfigLegacyCollection.ReadAsync(database, cancellationToken);

    public Task DropLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken) =>
        database.DropCollectionAsync(StorageConfigurationKeys.LegacyCollectionName, cancellationToken);
}

/// <summary>Reads of the old <c>StorageConfigurations</c> collection of one database (used by the job's repository and its test fake).</summary>
public static class StorageConfigLegacyCollection
{
    public static async Task<(bool Exists, List<StorageConfiguration> Docs)> ReadAsync(IMongoDatabase database, CancellationToken cancellationToken)
    {
        var names = await database.ListCollectionNamesAsync(
            new ListCollectionNamesOptions { Filter = new BsonDocument("name", StorageConfigurationKeys.LegacyCollectionName) }, cancellationToken);
        if (!await names.AnyAsync(cancellationToken))
            return (false, []);

        var docs = await database.GetCollection<StorageConfiguration>(StorageConfigurationKeys.LegacyCollectionName)
            .Find(Builders<StorageConfiguration>.Filter.Empty).ToListAsync(cancellationToken);
        return (true, docs);
    }
}
