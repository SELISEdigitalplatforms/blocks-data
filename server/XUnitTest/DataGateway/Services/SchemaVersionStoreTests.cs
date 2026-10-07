using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
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

    [Fact]
    public async Task BumpAsync_RaisesTheVersionByOneAndReturnsIt()
    {
        var store = Store();

        (await store.BumpAsync("tenant-1")).Should().Be(1);
        (await store.BumpAsync("tenant-1")).Should().Be(2);
        (await store.GetAsync("tenant-1")).Should().Be(2);
    }

    [Fact]
    public async Task BumpAsync_KeepsEachTenantsVersionSeparate()
    {
        var store = Store();

        await store.BumpAsync("tenant-a");
        await store.BumpAsync("tenant-a");
        await store.BumpAsync("tenant-b");

        (await store.GetAsync("tenant-a")).Should().Be(2);
        (await store.GetAsync("tenant-b")).Should().Be(1);
    }

    [Fact]
    public async Task BumpAsync_NeverHandsOutTheSameVersionTwiceUnderConcurrentPublishes()
    {
        var store = Store();

        var versions = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => store.BumpAsync("tenant-1")));

        versions.Should().OnlyHaveUniqueItems().And.BeEquivalentTo(Enumerable.Range(1, 20).Select(v => (long)v));
    }

    // ---------------- Redis copy ----------------

    [Fact]
    public async Task BumpAsync_CachesTheNewVersionForAMinute()
    {
        await Store().BumpAsync("tenant-1");

        _cache.Get(Key("tenant-1")).Should().Be("1");
        _cache.LifeSpanOf(Key("tenant-1")).Should().Be((long)SchemaVersionStore.CacheLifetime.TotalSeconds);
    }

    [Fact]
    public async Task BumpAsync_StillPublishesWhenRedisIsDown()
    {
        _cache.FailWrites = true;

        var version = await Store().BumpAsync("tenant-1");

        version.Should().Be(1, "MongoDB holds the version; the Redis copy is only a speed-up");
    }

    [Fact]
    public async Task GetCachedAsync_AnswersFromTheRedisCopy()
    {
        var store = Store();
        await store.BumpAsync("tenant-1");
        _cache.Set(Key("tenant-1"), "9");

        (await store.GetCachedAsync("tenant-1")).Should().Be(9);
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoAndRefillsAMissingCopy()
    {
        var store = Store();
        await store.BumpAsync("tenant-1");
        _cache.Remove(Key("tenant-1"));

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
        _cache.Get(Key("tenant-1")).Should().Be("1");
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoWhenRedisIsDown()
    {
        var store = Store();
        await store.BumpAsync("tenant-1");
        _cache.FailReads = true;

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
    }

    [Fact]
    public async Task GetCachedAsync_ReadsMongoWhenTheCopyIsNotANumber()
    {
        var store = Store();
        await store.BumpAsync("tenant-1");
        _cache.Set(Key("tenant-1"), "garbage");

        (await store.GetCachedAsync("tenant-1")).Should().Be(1);
    }

    [Fact]
    public async Task GetAsync_CorrectsAWrongCopy()
    {
        var store = Store();
        await store.BumpAsync("tenant-1");
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
