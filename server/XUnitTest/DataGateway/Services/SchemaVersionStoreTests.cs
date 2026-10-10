using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("Mongo")]
public class SchemaVersionStoreTests
{
    private readonly MongoFixture _fixture;
    private readonly Dictionary<string, IMongoDatabase> _tenantDatabases = new();
    private readonly InMemoryCacheClient _cache = new();

    public SchemaVersionStoreTests(MongoFixture fixture)
    {
        _fixture = fixture;
    }

    /// <summary>Each tenant id resolves to its own database, as it does in production.</summary>
    private SchemaVersionStore Store()
    {
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns((string tenantId) =>
        {
            if (!_tenantDatabases.TryGetValue(tenantId, out var database))
            {
                database = _fixture.CreateDatabase();
                _tenantDatabases[tenantId] = database;
            }
            return database;
        });
        return new SchemaVersionStore(
            new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object),
            _cache,
            NullLogger<SchemaVersionStore>.Instance);
    }

    private static string Key(string tenantId) => SchemaVersionStore.CacheKey(tenantId);

    // ---------------- MongoDB version ----------------

    [Fact]
    public async Task GetAsync_IsZeroForATenantThatNeverPublished()
    {
        (await Store().GetAsync("tenant-1")).Should().Be(0);
    }

    /// <summary>What a publish does with the version numbers: take the next one and make it live.</summary>
    private static async Task<long> PublishAsync(SchemaVersionStore store, string tenantId)
    {
        var version = await store.AllocateAsync(tenantId);
        return await store.MakeCurrentAsync(tenantId, version);
    }

    /// <summary>The tenant's state collection, in the database <see cref="Store"/> resolves it to.</summary>
    private IMongoCollection<BsonDocument> StateCollection(string tenantId)
    {
        if (!_tenantDatabases.TryGetValue(tenantId, out var database))
        {
            database = _fixture.CreateDatabase();
            _tenantDatabases[tenantId] = database;
        }
        return database.GetCollection<BsonDocument>("SchemaPublishStates");
    }

    [Fact]
    public async Task AllocateAsync_HandsOutTheNextNumberWithoutMakingItLive()
    {
        var store = Store();

        (await store.AllocateAsync("tenant-1")).Should().Be(1);
        (await store.AllocateAsync("tenant-1")).Should().Be(2);
        (await store.GetAsync("tenant-1")).Should().Be(0, "a version is only live once its snapshot is stored");
    }

    [Fact]
    public async Task MakeCurrentAsync_NeverMovesTheLiveVersionBackwards()
    {
        var store = Store();

        (await store.MakeCurrentAsync("tenant-1", 3)).Should().Be(3);
        (await store.MakeCurrentAsync("tenant-1", 2)).Should().Be(3, "an older publish finishing late must not replace a newer one");
        (await store.GetAsync("tenant-1")).Should().Be(3);
    }

    [Fact]
    public async Task AllocateAsync_ContinuesFromAVersionRaisedBeforeSnapshots()
    {
        var store = Store();
        await StateCollection("tenant-1").InsertOneAsync(new BsonDocument { { "_id", "state" }, { "CurrentVersion", 7L } });

        (await store.AllocateAsync("tenant-1")).Should().Be(8);
    }

    [Fact]
    public async Task AllocateAsync_NeverReusesANumberAfterARollback()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1"); // v1
        await PublishAsync(store, "tenant-1"); // v2
        await PublishAsync(store, "tenant-1"); // v3
        // Roll back to v1: only the live version moves.
        await StateCollection("tenant-1").UpdateOneAsync(
            new BsonDocument("_id", "state"), new BsonDocument("$set", new BsonDocument("CurrentVersion", 1L)));

        (await store.AllocateAsync("tenant-1")).Should().Be(4, "v2 and v3 already exist");
    }

    [Fact]
    public async Task SetCurrentAsync_CanMoveTheLiveVersionBackForARollback()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1"); // v1
        await PublishAsync(store, "tenant-1"); // v2
        await PublishAsync(store, "tenant-1"); // v3

        await store.SetCurrentAsync("tenant-1", 1);

        (await store.GetAsync("tenant-1")).Should().Be(1);
        _cache.Get(Key("tenant-1")).Should().Be("1", "pods polling Redis must see the rollback too");
        (await store.AllocateAsync("tenant-1")).Should().Be(4, "a rollback never makes an existing number available again");
    }

    [Fact]
    public async Task VersionsAreKeptPerTenant()
    {
        var store = Store();

        await PublishAsync(store, "tenant-a");
        await PublishAsync(store, "tenant-a");
        await PublishAsync(store, "tenant-b");

        (await store.GetAsync("tenant-a")).Should().Be(2);
        (await store.GetAsync("tenant-b")).Should().Be(1);
    }

    [Fact]
    public async Task AllocateAsync_NeverHandsOutTheSameNumberTwiceUnderConcurrentPublishes()
    {
        var store = Store();

        var versions = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => store.AllocateAsync("tenant-1")));

        versions.Should().OnlyHaveUniqueItems().And.BeEquivalentTo(Enumerable.Range(1, 20).Select(v => (long)v));
    }

    // ---------------- Redis copy ----------------

    [Fact]
    public async Task MakeCurrentAsync_CachesTheLiveVersionForAMinute()
    {
        await PublishAsync(Store(), "tenant-1");

        _cache.Get(Key("tenant-1")).Should().Be("1");
        _cache.LifeSpanOf(Key("tenant-1")).Should().Be((long)SchemaVersionStore.CacheLifetime.TotalSeconds);
    }

    [Fact]
    public async Task MakeCurrentAsync_StillPublishesWhenRedisIsDown()
    {
        _cache.FailWrites = true;

        var version = await PublishAsync(Store(), "tenant-1");

        version.Should().Be(1, "MongoDB holds the version; the Redis copy is only a speed-up");
    }

    [Fact]
    public async Task GetCachedAsync_AnswersFromTheRedisCopy()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1");
        _cache.Set(Key("tenant-1"), "9");

        (await store.GetCachedAsync("tenant-1")).Should().Be(9);
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoAndRefillsAMissingCopy()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1");
        _cache.Remove(Key("tenant-1"));

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
        _cache.Get(Key("tenant-1")).Should().Be("1");
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoWhenRedisIsDown()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1");
        _cache.FailReads = true;

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoWhenTheCopyIsNotANumber()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1");
        _cache.Set(Key("tenant-1"), "garbage");

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
    }

    [Fact]
    public async Task GetAsync_CorrectsAWrongCopy()
    {
        var store = Store();
        await PublishAsync(store, "tenant-1");
        _cache.Set(Key("tenant-1"), "9");

        (await store.GetAsync("tenant-1")).Should().Be(1);
        _cache.Get(Key("tenant-1")).Should().Be("1");
    }

    // ---------------- announcements ----------------

    [Fact]
    public async Task AnnounceAsync_PublishesTheTenantAndVersion()
    {
        await Store().AnnounceAsync("tenant-1", 7);

        var (channel, message) = _cache.Published.Should().ContainSingle().Subject;
        channel.Should().Be(SchemaVersionStore.ChannelName);
        JsonSerializer.Deserialize<SchemaVersionPublished>(message).Should().Be(new SchemaVersionPublished("tenant-1", 7));
    }

    [Fact]
    public async Task AnnounceAsync_DoesNotFailThePublishWhenRedisIsDown()
    {
        _cache.FailPublish = true;

        var announce = () => Store().AnnounceAsync("tenant-1", 7);

        await announce.Should().NotThrowAsync("pods that miss the message catch up on their next check");
    }

    [Fact]
    public void Constructor_RejectsEveryNullDependency()
    {
        var repository = new Mock<IDbRepository>().Object;
        var logger = NullLogger<SchemaVersionStore>.Instance;

        Assert.Throws<ArgumentNullException>(() => new SchemaVersionStore(null!, _cache, logger));
        Assert.Throws<ArgumentNullException>(() => new SchemaVersionStore(repository, null!, logger));
        Assert.Throws<ArgumentNullException>(() => new SchemaVersionStore(repository, _cache, null!));
    }
}
