using System.Collections.Concurrent;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Blocks.Secrets;
using DomainService.Configuration;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Worker.Jobs;
using XUnitTest.Infrastructure;
using XUnitTest.Storage;

namespace XUnitTest.Worker;

/// <summary>
/// Storage-config migration job: <c>StorageConfigurations</c> (tenant DBs + seed DB) → <c>storage-config:*</c> rows +
/// SecretStore. Real throwaway Mongo (one DB per tenant + seed), in-memory secret service and lock.
/// </summary>
[Collection("Mongo")]
public class StorageConfigMigrationJobTests
{
    private const string Conn = "DefaultEndpointsProtocol=https;AccountKey=MigrationConnValue==";
    private const string Access = "AKIA-MIGRATION-ACCESS";
    private const string Secret = "migration-secret-key";

    private readonly MongoFixture _fixture;
    private readonly FakeDatabases _dbs;
    private readonly FakeLock _lock = new();
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();

    public StorageConfigMigrationJobTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _dbs = new FakeDatabases(fixture.CreateDatabase(), fixture.CreateDatabase());
        BlocksContext.SetContext(null);
    }

    private StorageConfigurationStore Store() =>
        new(Mock.Of<IKeyValueStore>(MockBehavior.Strict), StorageConfigurationStoreTests.Accessor(_secrets), _logs.CreateLogger<StorageConfigurationStore>());

    private StorageConfigMigrationJob Job(string? snapshot = null) => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [StorageConfigMigrationJob.SnapshotTakenConfigKey] = snapshot
        }).Build(),
        _lock, Store(), new StorageConfigMigrationVerifier(StorageConfigurationStoreTests.Accessor(_secrets)),
        new StorageConfigMigrationTargets(_dbs, Store()), _logs.CreateLogger<StorageConfigMigrationJob>());

    private Task<StorageMigrationSummary> RunAsync(string mode, string? snapshot = null) => Job(snapshot).RunAsync(mode, CancellationToken.None);

    private static readonly DateTime OldDate = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);

    private static StorageConfiguration Doc(string name = "Default", string strategy = "Aws", string? conn = null, string? access = Access, string? secret = Secret) => new()
    {
        ItemId = Guid.NewGuid().ToString(),
        Name = name,
        StorageStrategy = strategy,
        ConnectionString = conn!,
        AccessKey = access!,
        SecretKey = secret!,
        CloudStorageRegionEndPoint = "eu-west-1",
        MaxFileSizeInBytes = 1234,
        UploadCompletionRequiredFor = [AccessModifier.Private],
        CreatedDate = OldDate,
        LastUpdatedDate = OldDate,
        CreatedBy = "creator",
        LastUpdatedBy = "editor"
    };

    private IMongoCollection<StorageConfiguration> Old(IMongoDatabase db) => db.GetCollection<StorageConfiguration>("StorageConfigurations");

    private async Task<IMongoDatabase> TenantWithDocsAsync(string tenant, bool isRoot = false, params StorageConfiguration[] docs)
    {
        var db = _dbs.Add(tenant, isRoot, _fixture);
        if (docs.Length > 0)
            await Old(db).InsertManyAsync(docs);
        return db;
    }

    private static StorageConfigScope Scope(string tenant, IMongoDatabase db) => StorageConfigScope.ForDatabase(tenant, db);

    private void LogsHoldNoValue()
    {
        foreach (var log in _logs.Logs)
            log.AllText().Should().NotContainAny(Conn, Access, Secret, "changed-by-hand");
    }

    // ---------------- guards ----------------

    [Fact]
    public async Task UnknownMode_DoesNothing()
    {
        var s = await RunAsync("migrate-all");
        s.Ran.Should().BeFalse();
        _lock.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task SecondReplica_SkipsWhenTheLockIsHeld()
    {
        await TenantWithDocsAsync("t1", false, Doc());
        _lock.HeldElsewhere = true;
        (await RunAsync("apply")).Ran.Should().BeFalse();
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Cleanup_RefusedWithoutSnapshotGate()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");

        var s = await RunAsync("cleanup");

        s.Ran.Should().BeFalse();
        (await Old(db).CountDocumentsAsync(FilterDefinition<StorageConfiguration>.Empty)).Should().Be(1);
        _logs.Logs.Should().Contain(l => l.Message.Contains("SnapshotTaken=yes"));
    }

    // ---------------- plan ----------------

    [Fact]
    public async Task Plan_ReadOnly_CountsDocsNamesAndMigrated()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc(), Doc("Second"), Doc("Default"));
        await TenantWithDocsAsync("root", true);
        _dbs.AddNoDb("no-db");

        var s = await RunAsync("plan");

        s.Results["t1"].Should().Be("docs=3 names=2 migrated=0 pending=2 rows=0 multiple-configs");
        s.Results["no-db"].Should().Be("skipped-no-db");
        s.Results[StorageConfigMigrationJob.SeedTargetId].Should().StartWith("docs=0");
        _secrets.Calls.Should().BeEmpty();
        (await db.GetCollection<BsonDocument>("KeyValueStores").CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    [Fact]
    public async Task Plan_SeedWithoutRootTenant_IsAProblem()
    {
        await TenantWithDocsAsync("t1", false, Doc());
        var s = await RunAsync("plan");
        s.Results[StorageConfigMigrationJob.SeedTargetId].Should().StartWith("problem:no-root-tenant");
    }

    // ---------------- apply ----------------

    [Fact]
    public async Task Apply_CreatesRowAndTenantSecrets_ThenIsIdempotent()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated=1 exists=0 errors=0");
        var row = await Store().GetSettingsAsync("Default", Scope("t1", db));
        row!.MigratedAt.Should().NotBeNull();
        row.StorageStrategy.Should().Be("Aws");
        row.UploadCompletionRequiredFor.Should().Equal("Private");
        row.LastUpdatedDate.Should().Be(OldDate);
        row.ConnectionStringSecretId.Should().BeNull();
        _secrets.Secrets[row.AccessKeySecretId!].Should().Match<FakeSecretService.Stored>(x =>
            x.TenantId == "t1" && x.Value == Access && x.Type == SecretTypes.Service);
        _secrets.Secrets[row.SecretKeySecretId!].Value.Should().Be(Secret);
        (await db.GetCollection<BsonDocument>("KeyValueStores").Find(new BsonDocument()).FirstAsync()).ToJson()
            .Should().NotContainAny(Access, Secret);

        var sets = _secrets.Calls.Count(c => c.Op == "Set");
        var again = await RunAsync("apply");
        again.Results["t1"].Should().Be("migrated=0 exists=1 errors=0");
        _secrets.Calls.Count(c => c.Op == "Set").Should().Be(sets);
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Apply_NeverOverwritesAnExistingRow()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        var appRow = await Store().SaveAsync(new StorageSettings { Name = "Default", StorageStrategy = "Azure" },
            new StorageSecretValues { ConnectionString = "app-conn" }, Scope("t1", db));

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated=0 exists=1 errors=0");
        var row = await Store().GetSettingsAsync("Default", Scope("t1", db));
        row!.StorageStrategy.Should().Be("Azure");
        row.ConnectionStringSecretId.Should().Be(appRow.ConnectionStringSecretId);
        row.MigratedAt.Should().BeNull();
    }

    [Fact]
    public async Task Apply_CrashResume_ReusesTheSecretOfTheCrashedRun_NoDuplicate()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");
        // Crash between secrets and row: drop the row, keep the secrets.
        await db.GetCollection<BsonDocument>("KeyValueStores").DeleteManyAsync(new BsonDocument());
        var before = _secrets.Secrets.Keys.ToHashSet();

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated=1 exists=0 errors=0");
        _secrets.Secrets.Keys.Should().BeEquivalentTo(before);
        var row = await Store().GetSettingsAsync("Default", Scope("t1", db));
        before.Should().Contain(row!.AccessKeySecretId!);
    }

    [Fact]
    public async Task Apply_SecretStoreDown_IsAnError_NothingWritten()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        _secrets.FailWith = new SecretVaultException("vault down", "set", "id");

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated=0 exists=0 errors=1");
        s.Errors.Should().Be(1);
        (await db.GetCollection<BsonDocument>("KeyValueStores").CountDocumentsAsync(new BsonDocument())).Should().Be(0);
    }

    [Fact]
    public async Task Apply_Seed_SecretsLiveInTheRootTenant()
    {
        await TenantWithDocsAsync("root", true);
        await Old(_dbs.Seed).InsertOneAsync(Doc());

        await RunAsync("apply");

        var row = await Store().GetSettingsAsync("Default", StorageConfigScope.ForSeed("root", _dbs.Seed));
        var secret = _secrets.Secrets[row!.AccessKeySecretId!];
        secret.TenantId.Should().Be("root");
        secret.Description.Should().StartWith("Seed storage configuration");
    }

    // ---------------- verify / cleanup ----------------

    [Fact]
    public async Task Verify_AfterApply_IsOk()
    {
        await TenantWithDocsAsync("t1", false, Doc(), Doc("Files", "SftpStorage", access: null, secret: null));
        await RunAsync("apply");

        var s = await RunAsync("verify");

        s.Results["t1"].Should().Be("names=2 ok=2 failed=0");
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Verify_ValueMismatch_IsAProblem_LoggedWithoutValue()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");
        var row = await Store().GetSettingsAsync("Default", Scope("t1", db));
        _secrets.Secrets[row!.AccessKeySecretId!].Value = "changed-by-hand";

        var s = await RunAsync("verify");

        s.Results["t1"].Should().Be("problem:names=1 ok=0 failed=1");
        _logs.Logs.Should().Contain(l => l.Message.Contains("value-differs=AccessKey"));
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Verify_OldDocChangedAfterMigration_IsAProblem()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");
        await Old(db).UpdateOneAsync(FilterDefinition<StorageConfiguration>.Empty,
            Builders<StorageConfiguration>.Update.Set(d => d.LastUpdatedDate, DateTime.UtcNow.AddMinutes(5)));

        (await RunAsync("verify")).Results["t1"].Should().StartWith("problem:");
        _logs.Logs.Should().Contain(l => l.Message.Contains("old-doc-changed-after-migration"));
    }

    [Fact]
    public async Task Verify_DeletedSecret_IsAProblem()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");
        var row = await Store().GetSettingsAsync("Default", Scope("t1", db));
        _secrets.Secrets[row!.SecretKeySecretId!].Status = SecretStatuses.Deleted;

        (await RunAsync("verify")).Results["t1"].Should().StartWith("problem:");
        _logs.Logs.Should().Contain(l => l.Message.Contains("secret-status=deleted"));
    }

    [Fact]
    public async Task Verify_RowSavedByTheAppAfterMigration_OnlyNeedsUsableSecrets()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());
        await RunAsync("apply");
        await Store().SaveAsync(new StorageSettings { Name = "Default", StorageStrategy = "Aws", MaxFileSizeInBytes = 99 },
            new StorageSecretValues { AccessKey = "new-access" }, Scope("t1", db));

        (await RunAsync("verify")).Results["t1"].Should().Be("names=1 ok=1 failed=0");
    }

    [Fact]
    public async Task Cleanup_DropsOnlyFullyVerifiedDatabases()
    {
        var good = await TenantWithDocsAsync("good", false, Doc());
        var bad = await TenantWithDocsAsync("bad", false, Doc());
        await RunAsync("apply");
        var badRow = await Store().GetSettingsAsync("Default", Scope("bad", bad));
        _secrets.Secrets[badRow!.AccessKeySecretId!].Value = "changed-by-hand";

        var s = await RunAsync("cleanup", snapshot: "yes");

        s.Results["good"].Should().Be("dropped docs=1");
        s.Results["bad"].Should().Be("problem:kept failed=1 no-name-docs=0");
        (await good.ListCollectionNames().ToListAsync()).Should().NotContain("StorageConfigurations");
        (await Old(bad).CountDocumentsAsync(FilterDefinition<StorageConfiguration>.Empty)).Should().Be(1);

        (await RunAsync("cleanup", snapshot: "yes")).Results["good"].Should().Be("no-collection");
    }

    [Fact]
    public async Task Cleanup_DocWithoutRow_KeepsTheCollection()
    {
        var db = await TenantWithDocsAsync("t1", false, Doc());

        var s = await RunAsync("cleanup", snapshot: "yes");

        s.Results["t1"].Should().StartWith("problem:kept failed=1");
        (await Old(db).CountDocumentsAsync(FilterDefinition<StorageConfiguration>.Empty)).Should().Be(1);
    }

    // ---------------- fakes ----------------

    private sealed class FakeDatabases(IMongoDatabase root, IMongoDatabase seed) : IStorageConfigMigrationDatabases
    {
        private readonly ConcurrentDictionary<string, (DscTenant Tenant, IMongoDatabase? Db)> _tenants = new();

        public IMongoDatabase Seed { get; } = seed;

        public IMongoDatabase Add(string tenant, bool isRoot, MongoFixture fixture) =>
            _tenants.GetOrAdd(tenant, _ => (new DscTenant(tenant, isRoot, false, "cs", "db"), isRoot ? root : fixture.CreateDatabase())).Db!;

        public void AddNoDb(string tenant) =>
            _tenants.GetOrAdd(tenant, _ => (new DscTenant(tenant, false, false, string.Empty, string.Empty), null));

        public Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<DscTenant>>(_tenants.Values.Select(v => v.Tenant).OrderBy(t => t.TenantId, StringComparer.Ordinal).ToList());

        public IMongoDatabase TenantDb(DscTenant tenant) =>
            _tenants[tenant.TenantId].Db ?? throw new InvalidOperationException("tenant has no DB");

        public Task<(bool Exists, List<StorageConfiguration> Docs)> ReadLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken) =>
            StorageConfigLegacyCollection.ReadAsync(database, cancellationToken);

        public Task DropLegacyAsync(IMongoDatabase database, CancellationToken cancellationToken) =>
            database.DropCollectionAsync("StorageConfigurations", cancellationToken);
    }

    private sealed class FakeLock : IDscMigrationRedis
    {
        public bool HeldElsewhere { get; set; }
        public List<string> Calls { get; } = [];

        public Task<bool> TryLockAsync(string key, string token, TimeSpan ttl)
        {
            Calls.Add(key);
            return Task.FromResult(!HeldElsewhere);
        }

        public Task ReleaseLockAsync(string key, string token) => Task.CompletedTask;
        public Task<Dictionary<string, string>> GetHashAsync(string key) => Task.FromResult(new Dictionary<string, string>());
        public Task<bool> RemoveLegacyFieldAsync(string key) => Task.FromResult(false);
        public Task DeleteHashAsync(string key) => Task.CompletedTask;
    }
}
