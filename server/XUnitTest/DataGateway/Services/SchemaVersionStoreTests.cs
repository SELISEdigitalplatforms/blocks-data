using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("Mongo")]
public class SchemaVersionStoreTests
{
    private readonly MongoFixture _fixture;
    private readonly Dictionary<string, IMongoDatabase> _tenantDatabases = new();

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
        return new SchemaVersionStore(new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object));
    }

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

    [Fact]
    public void Constructor_RejectsANullRepository()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaVersionStore(null!));
    }
}
