using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Blocks.Secrets;
using DomainService.Configuration;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.Storage;

/// <summary>
/// Storage configuration reader (<see cref="StorageConfigurationProvider"/>) and writer (<see cref="StorageConfigurationStore"/>):
/// rows in a real throwaway Mongo through the real Genesis <see cref="MongoKeyValueStore"/>, secrets in the in-memory
/// <see cref="FakeSecretService"/> (tenant-scoped like Blocks.Secrets).
/// </summary>
[Collection("Mongo")]
public class StorageConfigurationStoreTests
{
    private const string Tenant = "tenant-a";
    private const string ConnValue = "DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=StoreConnSecretValue==";
    private const string AccessValue = "AKIA-STORE-ACCESS-VALUE";
    private const string SecretValue = "store-secret-key-value";

    private readonly MongoFixture _fixture;
    private readonly IMongoDatabase _db;
    private readonly FakeSecretService _secrets = new();
    private readonly Mock<IConfigurationRepository> _legacy = new(MockBehavior.Strict);
    private readonly RecordingLoggerProvider _logs = new();
    private readonly MongoKeyValueStore _kv;

    public StorageConfigurationStoreTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _db = fixture.CreateDatabase();
        var dbProvider = new Mock<IDbContextProvider>();
        dbProvider.Setup(p => p.GetDatabase()).Returns(_db);
        _kv = new MongoKeyValueStore(dbProvider.Object, Mock.Of<IBlocksSecret>());
        BlocksTestContext.Set(tenantId: Tenant, userId: "user-1");
    }

    internal static IStorageSecretAccessor Accessor(FakeSecretService fake)
    {
        var services = new ServiceCollection();
        services.AddScoped<ISecretService>(_ => fake);
        return new StorageSecretAccessor(services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>());
    }

    private StorageConfigurationStore Store(IKeyValueStore? kv = null) =>
        new(kv ?? _kv, Accessor(_secrets), _logs.CreateLogger<StorageConfigurationStore>());

    private StorageConfigurationProvider Provider(IKeyValueStore? kv = null) =>
        new(kv ?? _kv, _legacy.Object, Accessor(_secrets), _logs.CreateLogger<StorageConfigurationProvider>());

    private static StorageSettings Azure(string name = "Default") => new()
    {
        Name = name,
        StorageStrategy = "Azure",
        UploadUrlExpirySeconds = 300,
        UploadCompletionRequiredFor = ["Public"]
    };

    private static StorageSecretValues Values(string? conn = ConnValue, string? access = null, string? secret = null) =>
        new() { ConnectionString = conn, AccessKey = access, SecretKey = secret };

    private async Task<BsonDocument> RawRowAsync(string name) =>
        await _db.GetCollection<BsonDocument>("KeyValueStores").Find(new BsonDocument("Key", "storage-config:" + name)).FirstAsync();

    private void LogsHoldNoValue()
    {
        foreach (var log in _logs.Logs)
            log.AllText().Should().NotContainAny(ConnValue, AccessValue, SecretValue, "rotated-value");
    }

    // ---------------- reader ----------------

    [Fact]
    public async Task Reader_RowFirst_ResolvesSecretsInTheTenantsOwnContext_LegacyNotRead()
    {
        await Store().SaveAsync(Azure(), Values(access: AccessValue));

        var config = await Provider().GetByNameAsync(" Default ");

        config.Should().NotBeNull();
        config!.Name.Should().Be("Default");
        config.StorageStrategy.Should().Be("Azure");
        config.ConnectionString.Should().Be(ConnValue);
        config.AccessKey.Should().Be(AccessValue);
        config.SecretKey.Should().BeNull();
        config.UploadUrlExpirySeconds.Should().Be(300);
        config.UploadCompletionRequiredFor.Should().Equal(AccessModifier.Public);
        _secrets.Calls.Where(c => c.Op == "GetValue").Should().OnlyContain(c => c.Tenant == Tenant && c.User == StorageSecretAccessor.ServiceUserId);
        _legacy.VerifyNoOtherCalls();
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Reader_NoRow_FallsBackToTheOldDocument()
    {
        var old = new StorageConfiguration { Name = "Default", StorageStrategy = "Aws", AccessKey = "old-access" };
        _legacy.Setup(l => l.GetConfigurationByNameAsync("Default")).ReturnsAsync(old);

        (await Provider().GetByNameAsync("Default")).Should().BeSameAs(old);
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Reader_NoConfigAtAll_ReturnsNull()
    {
        _legacy.Setup(l => l.GetConfigurationByNameAsync("Default")).ReturnsAsync((StorageConfiguration)null!);
        (await Provider().GetByNameAsync("Default")).Should().BeNull();
        (await Provider().GetByNameAsync("  ")).Should().BeNull();
    }

    [Fact]
    public async Task Reader_NeverCachesAValue_EveryCallReadsSecretStore()
    {
        await Store().SaveAsync(Azure(), Values());
        var provider = Provider();

        (await provider.GetByNameAsync("Default"))!.ConnectionString.Should().Be(ConnValue);
        await Store().SaveAsync(Azure(), Values(conn: "rotated-value"));
        (await provider.GetByNameAsync("Default"))!.ConnectionString.Should().Be("rotated-value");

        _secrets.ValueReads.Should().Be(2);
    }

    [Fact]
    public async Task Reader_RowWithDeletedSecret_IsNotFound_LogsNameAndId_NoFallback()
    {
        var saved = await Store().SaveAsync(Azure(), Values());
        _secrets.Secrets[saved.ConnectionStringSecretId!].Status = SecretStatuses.Deleted;

        (await Provider().GetByNameAsync("Default")).Should().BeNull();

        _legacy.VerifyNoOtherCalls();
        _logs.Logs.Should().Contain(l => l.Message.Contains("secret-unusable") && l.Message.Contains("Default") && l.Message.Contains(saved.ConnectionStringSecretId!));
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Reader_SecretStoreDown_IsAnError_NotSilentFallback()
    {
        await Store().SaveAsync(Azure(), Values());
        _secrets.FailWith = new SecretVaultException("vault down", "read", "id");

        var act = () => Provider().GetByNameAsync("Default");

        var ex = (await act.Should().ThrowAsync<StorageConfigurationUnavailableException>()).Which;
        ex.Message.Should().Contain("Default").And.NotContain(ConnValue);
        _legacy.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Reader_KeyValueReadError_IsAnError_NotNotConfigured()
    {
        var kv = new Mock<IKeyValueStore>();
        kv.Setup(k => k.GetAsync<StorageSettings>(It.IsAny<string>(), true, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MongoException("db down"));

        var act = () => Provider(kv.Object).GetByNameAsync("Default");

        await act.Should().ThrowAsync<MongoException>();
        _legacy.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Reader_ByStrategy_RowWins_OldDocWithTheSameNameIsIgnored()
    {
        await Store().SaveAsync(new StorageSettings { Name = "Files", StorageStrategy = "SftpStorage", Host = "h" },
            new StorageSecretValues { Password = "pw-value", SftpSecretKey = "sftp-key-value" });
        _legacy.Setup(l => l.GetAllConfigurationsAsync()).ReturnsAsync(
        [
            new StorageConfiguration { Name = "Files", StorageStrategy = "Azure" },
            new StorageConfiguration { Name = "Old", StorageStrategy = "Azure", ConnectionString = "old-conn" }
        ]);

        var sftp = await Provider().GetByStrategyAsync("SftpStorage");
        sftp!.Password.Should().Be("pw-value");
        sftp.SftpSecretKey.Should().Be("sftp-key-value");

        // Only "Old" may come from the collection: "Files" has a row (Sftp now).
        (await Provider().GetByStrategyAsync("Azure"))!.Name.Should().Be("Old");

        var all = await Provider().GetAllAsync();
        all.Select(c => c.Name).Should().Equal("Files", "Old");
    }

    // ---------------- writer ----------------

    [Fact]
    public async Task Save_Create_MakesServiceSecrets_RowHoldsOnlyIds()
    {
        var saved = await Store().SaveAsync(Azure(), Values(access: AccessValue, secret: ""));

        saved.ConnectionStringSecretId.Should().NotBeNullOrEmpty();
        saved.AccessKeySecretId.Should().NotBeNullOrEmpty();
        saved.SecretKeySecretId.Should().BeNull();
        saved.CreatedBy.Should().Be("user-1");
        var conn = _secrets.Secrets[saved.ConnectionStringSecretId!];
        conn.TenantId.Should().Be(Tenant);
        conn.Type.Should().Be(SecretTypes.Service);
        conn.Name.Should().Be("storage-Default-ConnectionString");
        conn.Description.Should().Be("Storage configuration \"Default\" ConnectionString");

        var raw = (await RawRowAsync("Default")).ToJson();
        raw.Should().NotContainAny(ConnValue, AccessValue).And.Contain(saved.ConnectionStringSecretId!);
        LogsHoldNoValue();
    }

    [Fact]
    public async Task Save_Update_RotatesInPlace_EmptyKeepsTheSecret_CallerIdsIgnored()
    {
        var store = Store();
        var first = await store.SaveAsync(Azure(), Values(access: AccessValue));
        var other = _secrets.Add(Tenant, "someone-elses-value");

        var forged = Azure();
        forged.ConnectionStringSecretId = other.Id;
        forged.UploadUrlExpirySeconds = 600;
        var second = await store.SaveAsync(forged, Values(conn: "rotated-value", access: null));

        second.ConnectionStringSecretId.Should().Be(first.ConnectionStringSecretId);
        second.AccessKeySecretId.Should().Be(first.AccessKeySecretId);
        second.CreatedDate.Should().BeCloseTo(first.CreatedDate, TimeSpan.FromMilliseconds(1));
        _secrets.Secrets[first.ConnectionStringSecretId!].Value.Should().Be("rotated-value");
        _secrets.Secrets[first.AccessKeySecretId!].Value.Should().Be(AccessValue);
        other.Value.Should().Be("someone-elses-value");
        _secrets.Calls.Count(c => c.Op == "Set").Should().Be(2);
        (await store.GetSettingsAsync("Default"))!.UploadUrlExpirySeconds.Should().Be(600);
    }

    [Fact]
    public async Task Save_BrokenReference_CreatesANewSecret()
    {
        var store = Store();
        var first = await store.SaveAsync(Azure(), Values());
        _secrets.Secrets[first.ConnectionStringSecretId!].Status = SecretStatuses.Deleted;

        var second = await store.SaveAsync(Azure(), Values(conn: "rotated-value"));

        second.ConnectionStringSecretId.Should().NotBe(first.ConnectionStringSecretId);
        _secrets.Secrets[second.ConnectionStringSecretId!].Value.Should().Be("rotated-value");
    }

    [Fact]
    public async Task Save_SecretStoreDown_Throws_RowUnchanged_NoDuplicate()
    {
        var store = Store();
        var first = await store.SaveAsync(Azure(), Values());
        _secrets.FailWith = new SecretVaultException("vault down", "get", "id");

        var act = () => store.SaveAsync(Azure(), Values(conn: "rotated-value"));

        await act.Should().ThrowAsync<SecretVaultException>();
        _secrets.FailWith = null;
        (await store.GetSettingsAsync("Default"))!.ConnectionStringSecretId.Should().Be(first.ConnectionStringSecretId);
        _secrets.Secrets.Should().HaveCount(1);
    }

    [Fact]
    public async Task Save_RowWriteFails_RetiresTheSecretsItCreated()
    {
        var kv = new Mock<IKeyValueStore>();
        kv.Setup(k => k.GetAsync<StorageSettings>(It.IsAny<string>(), true, It.IsAny<CancellationToken>())).ReturnsAsync((StorageSettings?)null);
        kv.Setup(k => k.SetAsync(It.IsAny<string>(), It.IsAny<StorageSettings>(), true, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MongoException("db down"));

        var act = () => Store(kv.Object).SaveAsync(Azure(), Values(access: AccessValue));

        await act.Should().ThrowAsync<MongoException>();
        _secrets.Secrets.Values.Should().HaveCount(2).And.OnlyContain(s => s.Status == SecretStatuses.Deleted);
    }

    [Fact]
    public async Task Save_NameIsRequired()
    {
        var act = () => Store().SaveAsync(new StorageSettings { Name = "  " }, Values());
        await act.Should().ThrowAsync<ArgumentException>();
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task SecretName_OnlyAllowedCharacters_AtMost100()
    {
        var saved = await Store().SaveAsync(Azure("my config/" + new string('x', 150)), Values());
        var name = _secrets.Secrets[saved.ConnectionStringSecretId!].Name;
        name.Should().MatchRegex("^[A-Za-z0-9][A-Za-z0-9._-]*$");
        name.Length.Should().BeLessThanOrEqualTo(100);
        name.Should().StartWith("storage-my-config-").And.EndWith("-ConnectionString");
    }

    [Fact]
    public async Task Delete_RemovesRow_ThenSoftDeletesSecrets_AlreadyGoneIsFine()
    {
        var store = Store();
        var saved = await store.SaveAsync(Azure(), Values(access: AccessValue));
        _secrets.Secrets.TryRemove(saved.AccessKeySecretId!, out _);

        (await store.DeleteAsync("Default")).Should().BeTrue();

        (await store.GetSettingsAsync("Default")).Should().BeNull();
        _secrets.Secrets[saved.ConnectionStringSecretId!].Status.Should().Be(SecretStatuses.Deleted);
        (await store.DeleteAsync("Default")).Should().BeFalse();
    }

    [Fact]
    public async Task Status_FromMetadataOnly_NeverAValueRead()
    {
        var store = Store();
        var saved = await store.SaveAsync(Azure(), Values(access: AccessValue, secret: SecretValue));
        _secrets.Secrets[saved.AccessKeySecretId!].Status = SecretStatuses.Deleted;
        _secrets.Secrets.TryRemove(saved.SecretKeySecretId!, out _);

        var status = await store.GetSecretStatusAsync(saved);

        status["ConnectionString"].Should().Be(StorageSecretStatus.Active);
        status["AccessKey"].Should().Be(StorageSecretStatus.Archived);
        status["SecretKey"].Should().Be(StorageSecretStatus.Missing);
        status["Password"].Should().Be(StorageSecretStatus.None);
        _secrets.ValueReads.Should().Be(0);

        _secrets.FailWith = new SecretVaultException("vault down", "get", "id");
        (await store.GetSecretStatusAsync(saved))["ConnectionString"].Should().Be(StorageSecretStatus.Unavailable);
    }

    // ---------------- seed copy / create-if-absent ----------------

    [Fact]
    public async Task CopyAll_SeedToTenant_NewTenantSecretsWithSeedValues_Idempotent()
    {
        var seedDb = _fixture.CreateDatabase();
        var targetDb = _fixture.CreateDatabase();
        var store = Store();
        var seed = StorageConfigScope.ForSeed("root", seedDb);
        var target = StorageConfigScope.ForDatabase("new-tenant", targetDb);
        var seedRow = await store.SaveAsync(Azure(), Values(), seed);
        await store.SaveAsync(Azure("Broken"), Values(), seed);
        var broken = await store.GetSettingsAsync("Broken", seed);
        _secrets.Secrets[broken!.ConnectionStringSecretId!].Status = SecretStatuses.Deleted;

        var result = await store.CopyAllAsync(seed, target);

        result.Copied.Should().Equal("Default");
        result.Failed.Should().Equal("Broken");
        var copied = await store.GetSettingsAsync("Default", target);
        copied!.ConnectionStringSecretId.Should().NotBe(seedRow.ConnectionStringSecretId);
        var secret = _secrets.Secrets[copied.ConnectionStringSecretId!];
        secret.TenantId.Should().Be("new-tenant");
        secret.Value.Should().Be(ConnValue);
        _secrets.Secrets[seedRow.ConnectionStringSecretId!].Description.Should().StartWith("Seed storage configuration");

        var sets = _secrets.Calls.Count(c => c.Op == "Set");
        var again = await store.CopyAllAsync(seed, target);
        again.Skipped.Should().Contain("Default");
        _secrets.Calls.Count(c => c.Op == "Set").Should().Be(sets);
    }

    [Fact]
    public async Task CreateIfAbsent_ReusesACrashedRunsSecret_NeverOverwritesARow()
    {
        var db = _fixture.CreateDatabase();
        var scope = StorageConfigScope.ForDatabase(Tenant, db);
        var store = Store();
        // A crashed earlier run: the secret exists, the row does not.
        var orphan = await store.SaveAsync(Azure(), Values(conn: "stale-value"), scope);
        await db.GetCollection<BsonDocument>("KeyValueStores").DeleteManyAsync(new BsonDocument());

        var created = await store.CreateIfAbsentAsync(Azure(), Values(), scope);

        created.Created.Should().BeTrue();
        created.Settings!.ConnectionStringSecretId.Should().Be(orphan.ConnectionStringSecretId);
        _secrets.Secrets.Should().HaveCount(1);
        _secrets.Secrets[orphan.ConnectionStringSecretId!].Value.Should().Be(ConnValue);

        var second = await store.CreateIfAbsentAsync(Azure(), Values(conn: "other-value"), scope);
        second.Created.Should().BeFalse();
        _secrets.Secrets[orphan.ConnectionStringSecretId!].Value.Should().Be(ConnValue);
    }

    [Fact]
    public async Task RowsWrittenToAnExplicitDatabase_AreReadableByTheGenesisStore()
    {
        var saved = await Store().SaveAsync(Azure(), Values(), StorageConfigScope.ForDatabase(Tenant, _db));
        var viaGenesis = await _kv.GetAsync<StorageSettings>("storage-config:Default");
        viaGenesis!.ConnectionStringSecretId.Should().Be(saved.ConnectionStringSecretId);
        viaGenesis.UploadCompletionRequiredFor.Should().Equal("Public");
    }
}
