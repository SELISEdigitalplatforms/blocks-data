using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Repositories;

[Collection("Mongo")]
public class GqlDbRepositoryTests
{
    private readonly IMongoDatabase _db;
    private readonly MongoFixture _fixture;
    private readonly Mock<ICacheClient> _cache = new();
    private readonly Mock<IDataSourceClientCache> _clientCache = new();
    private readonly GqlDbRepository _repo;

    /// <summary>A store whose rebuilt route is the Blocks DB (the hash is missing in most of these tests).</summary>
    private static Mock<IDataSourceConfigStore> DefaultStore()
    {
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        return store;
    }

    public GqlDbRepositoryTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _db = fixture.CreateDatabase();
        // Ensure tenant resolution yields empty so the repository falls back to GetDatabase(tenantId).
        BlocksContext.SetContext(null);
        RequestContextAccessor.Clear();
        _cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        _repo = new GqlDbRepository(provider.Object, _cache.Object, _clientCache.Object, DefaultStore().Object);
    }

    private static BsonDocument Doc(string name, int qty) =>
        new() { { "_id", Guid.NewGuid().ToString() }, { "Name", name }, { "Qty", qty } };

    [Fact]
    public async Task Insert_Get_Update_Delete_Roundtrip()
    {
        var doc = Doc("A", 1);
        var id = doc["_id"].AsString;
        await _repo.InsertAsync("Items", doc);

        (await _repo.GetItemAsync("Items", id)).Should().NotBeNull();
        (await _repo.GetItemAsync("Items", new BsonDocument("Name", "A"))).Should().NotBeNull();

        var upd = await _repo.UpdateAsync("Items", new BsonDocument("_id", id), new BsonDocument("Qty", 5));
        upd.TotalImpactedData.Should().Be(1);

        var del = await _repo.DeleteAsync("Items", new BsonDocument("_id", id));
        del.TotalImpactedData.Should().Be(1);
    }

    [Fact]
    public async Task GetItems_And_WithCount()
    {
        await _repo.InsertManyAsync("Cats", new List<BsonDocument> { Doc("c1", 1), Doc("c2", 2) });

        var items = await _repo.GetItemsAsync("Cats", new BsonDocument(), new BsonDocument("Name", 1), null, 0, 10);
        items.Should().NotBeEmpty();

        var (docs, count) = await _repo.GetItemsWithCountAsync("Cats", new BsonDocument());
        count.Should().BeGreaterThanOrEqualTo(2);
        docs.Should().NotBeEmpty();
    }

    [Fact]
    public async Task InsertMany_ReturnsItemIds()
    {
        var docs = new List<BsonDocument> { Doc("m1", 1), Doc("m2", 2) };
        var result = await _repo.InsertManyAsync("Bulk", docs);

        result.Acknowledged.Should().BeTrue();
        result.TotalImpactedData.Should().Be(2);
        result.ItemIds.Should().HaveCount(2);
    }

    [Fact]
    public async Task InsertMany_Empty_ReturnsZero()
    {
        var result = await _repo.InsertManyAsync("Bulk", new List<BsonDocument>());
        result.TotalImpactedData.Should().Be(0);
        result.Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateMany_And_DeleteMany()
    {
        await _repo.InsertManyAsync("Grp", new List<BsonDocument>
        {
            new() { { "_id", Guid.NewGuid().ToString() }, { "G", "x" } },
            new() { { "_id", Guid.NewGuid().ToString() }, { "G", "x" } }
        });

        var upd = await _repo.UpdateManyAsync("Grp", new BsonDocument("G", "x"), new BsonDocument("Extra", 1));
        upd.TotalImpactedData.Should().Be(2);

        var del = await _repo.DeleteManyAsync("Grp", new BsonDocument("G", "x"));
        del.TotalImpactedData.Should().Be(2);
    }

    [Fact]
    public async Task GetCollectionsDataCount_CountsTaggedDocsAcrossCollections()
    {
        await _repo.InsertManyAsync("Persons", new List<BsonDocument>
        {
            new() { { "_id", Guid.NewGuid().ToString() }, { "Tags", new BsonArray { "mock-data" } } },
            new() { { "_id", Guid.NewGuid().ToString() }, { "Tags", new BsonArray { "mock-data" } } }
        });
        await _repo.InsertManyAsync("Cars", new List<BsonDocument>
        {
            new() { { "_id", Guid.NewGuid().ToString() }, { "Tags", new BsonArray { "mock-data" } } }
        });

        var map = new Dictionary<string, string> { { "Persons", "Person" }, { "Cars", "Car" } };
        var filter = Builders<BsonDocument>.Filter.AnyEq("Tags", "mock-data");

        var result = await _repo.GetCollectionsDataCount(map, filter);

        result.Should().Contain(r => r.SchemaName == "Persons" && r.Count == 2);
        result.Should().Contain(r => r.SchemaName == "Cars" && r.Count == 1);
    }

    [Fact]
    public async Task GetCollectionsDataCount_EmptyMap_ReturnsEmpty()
    {
        var result = await _repo.GetCollectionsDataCount(new Dictionary<string, string>());
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDatabaseInfo_DefaultHash_UsesTheBlocksTenantDb()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-x" };
        _cache.Setup(c => c.GetHashValueAsync("tenant-x")).ReturnsAsync(new[]
        {
            new HashEntry("DbConnectionSecretId", "0123456789abcdef0123456789abcdef"),
            new HashEntry("DatabaseName", "somedb"),
            new HashEntry("ConnectionType", "Default"),
            new HashEntry("Version", "1")
        });

        var id = Guid.NewGuid().ToString();
        await _repo.InsertAsync("CachedColl", new BsonDocument { { "_id", id }, { "V", 1 } });
        (await _repo.GetItemAsync("CachedColl", id)).Should().NotBeNull();

        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task Same_repository_follows_each_request_tenant_and_preserves_custom_override()
    {
        var dev = _fixture.CreateDatabase();
        var other = _fixture.CreateDatabase();
        var custom = _fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase("dev-tenant")).Returns(dev);
        provider.Setup(p => p.GetDatabase("other-tenant")).Returns(other);
        var clientCache = new Mock<IDataSourceClientCache>();
        clientCache.Setup(c => c.GetAsync("custom-tenant", "0123456789abcdef0123456789abcdef", "7", custom.DatabaseNamespace.DatabaseName, It.IsAny<CancellationToken>()))
            .ReturnsAsync(custom);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        cache.Setup(c => c.GetHashValueAsync("custom-tenant")).ReturnsAsync(new[]
        {
            new HashEntry("DbConnectionSecretId", "0123456789abcdef0123456789abcdef"),
            new HashEntry("DatabaseName", custom.DatabaseNamespace.DatabaseName),
            new HashEntry("ConnectionType", "Custom"),
            new HashEntry("Version", "7")
        });
        var repository = new GqlDbRepository(provider.Object, cache.Object, clientCache.Object, DefaultStore().Object);
        var id = Guid.NewGuid().ToString();

        foreach (var (tenantId, name) in new[]
                 { ("dev-tenant", "dev"), ("other-tenant", "other"), ("custom-tenant", "custom") })
        {
            RequestContextAccessor.Current = new RequestContext { TenantId = tenantId };
            await repository.InsertAsync("Items", new BsonDocument { { "_id", id }, { "Name", name } });
        }

        foreach (var (tenantId, name) in new[]
                 { ("dev-tenant", "dev"), ("other-tenant", "other"), ("custom-tenant", "custom") })
        {
            RequestContextAccessor.Current = new RequestContext { TenantId = tenantId };
            (await repository.GetItemAsync("Items", id))!["Name"].AsString.Should().Be(name);
        }

        RequestContextAccessor.Clear();
    }

    // ---------------- routing by hash shape (Default / Custom / rebuilt from the root doc) ----------------

    private const string SecretId = "0123456789abcdef0123456789abcdef";

    private sealed class Routing
    {
        public Mock<IDbContextProvider> Provider { get; } = new();
        public Mock<ICacheClient> Cache { get; } = new();
        public Mock<IDataSourceClientCache> ClientCache { get; } = new();
        public Mock<IDataSourceConfigStore> Store { get; } = DefaultStore();
        public GqlDbRepository Repo => new(Provider.Object, Cache.Object, ClientCache.Object, Store.Object);
    }

    private static HashEntry[] Hash(string type, string id = SecretId, string db = "x", string version = "1") =>
    [
        new HashEntry("DbConnectionSecretId", id), new HashEntry("DatabaseName", db),
        new HashEntry("ConnectionType", type), new HashEntry("Version", version)
    ];

    private Routing Route(string tenant, params HashEntry[] hash)
    {
        var r = new Routing();
        r.Provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        r.Provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        r.Cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        r.Cache.Setup(c => c.GetHashValueAsync(tenant)).ReturnsAsync(hash);
        r.ClientCache.Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(_db);
        return r;
    }

    private static void NoClientCacheGet(Routing r) =>
        r.ClientCache.Verify(c => c.GetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

    [Fact]
    public async Task DefaultHash_BlocksTenantDb_ReleasesTheOldClient_NoSecretPath_NoRebuild()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-1" };
        var r = Route("t-1", Hash("Default"));
        await r.Repo.GetItemAsync("C", "x");
        r.Provider.Verify(p => p.GetDatabase("t-1"), Times.Once);
        r.ClientCache.Verify(c => c.Release("t-1"), Times.Once);
        NoClientCacheGet(r);
        r.Store.Verify(x => x.LoadAsync(It.IsAny<string>()), Times.Never);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task CustomHash_GoesThroughTheClientCache_WithVersionAndDbName_NeverGenesisWithAConnectionString()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-byo" };
        var r = Route("t-byo", Hash("Custom", db: "byo", version: "638900000000000000"));
        await r.Repo.GetItemAsync("C", "x");
        r.ClientCache.Verify(c => c.GetAsync("t-byo", SecretId, "638900000000000000", "byo", It.IsAny<CancellationToken>()), Times.Once);
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>()), Times.Never);
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>()), Times.Never);
        r.Store.Verify(x => x.LoadAsync(It.IsAny<string>()), Times.Never);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task NoHash_IsRebuiltFromTheRootDoc_DefaultRoute_BlocksTenantDb()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-def" };
        var r = Route("t-def");
        await r.Repo.GetItemAsync("C", "x");
        r.Store.Verify(x => x.LoadAsync("t-def"), Times.Once);
        r.Provider.Verify(p => p.GetDatabase("t-def"), Times.Once);
        NoClientCacheGet(r);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task NoHash_RebuiltCustomRoute_UsesTheClientCache()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-c" };
        var r = Route("t-c");
        r.Store.Setup(x => x.LoadAsync("t-c")).ReturnsAsync(new DataSourceRoute(true, SecretId, "byo", "42"));
        await r.Repo.GetItemAsync("C", "x");
        r.ClientCache.Verify(c => c.GetAsync("t-c", SecretId, "42", "byo", It.IsAny<CancellationToken>()), Times.Once);
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>()), Times.Never);
        RequestContextAccessor.Clear();
    }

    [Theory]
    [InlineData("OnlyOldField")]
    [InlineData("NoType")]
    [InlineData("BadType")]
    [InlineData("BlankSecretId")]
    public async Task UnusableHash_IsNeverRead_AsAnOldShape_ItIsRebuilt(string shape)
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-old" };
        var hash = shape switch
        {
            // The removed field is not understood any more: nothing is decoded, the root doc decides.
            "OnlyOldField" => new[] { new HashEntry("DbConnectionString", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("mongodb://legacy/"))), new HashEntry("DatabaseName", "legacydb") },
            "NoType" => new[] { new HashEntry("DbConnectionSecretId", SecretId), new HashEntry("DatabaseName", "x"), new HashEntry("Version", "1") },
            "BadType" => Hash("custom"),
            _ => Hash("Custom", id: " ")
        };
        var r = Route("t-old", hash);
        await r.Repo.GetItemAsync("C", "x");
        r.Store.Verify(x => x.LoadAsync("t-old"), Times.Once);
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>()), Times.Never);
        NoClientCacheGet(r);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task RebuildFailure_FailsClosed_NeverTheBlocksTenantDb()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-x" };
        var r = Route("t-x");
        r.Store.Setup(x => x.LoadAsync("t-x")).ThrowsAsync(new DataSourceUnavailableException("secret broken"));

        var act = () => r.Repo.GetItemAsync("C", "x");

        await act.Should().ThrowAsync<DataSourceUnavailableException>().WithMessage("secret broken");
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>()), Times.Never);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task SecretFailure_FailsClosed_NeverTheBlocksTenantDb()
    {
        RequestContextAccessor.Current = new RequestContext { TenantId = "t-byo" };
        var r = Route("t-byo", Hash("Custom", db: "byo"));
        r.ClientCache.Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new DataSourceUnavailableException("vault down"));

        var act = () => r.Repo.GetItemAsync("C", "x");

        await act.Should().ThrowAsync<DataSourceUnavailableException>().WithMessage("vault down");
        r.Provider.Verify(p => p.GetDatabase(It.IsAny<string>()), Times.Never);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task Tenant_AuthenticatedCallerWins_AnonymousUsesTheHeaderTenant()
    {
        var r = Route("tenant-a", Hash("Custom", db: "a"));
        r.Cache.Setup(c => c.GetHashValueAsync("tenant-b")).ReturnsAsync(Hash("Custom", db: "b"));

        BlocksTestContext.Set(tenantId: "tenant-a");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-b" };
        await r.Repo.GetItemAsync("C", "x");
        r.ClientCache.Verify(c => c.GetAsync("tenant-a", It.IsAny<string>(), It.IsAny<string>(), "a", It.IsAny<CancellationToken>()), Times.Once);

        BlocksContext.SetContext(null);
        await r.Repo.GetItemAsync("C", "x");
        r.ClientCache.Verify(c => c.GetAsync("tenant-b", It.IsAny<string>(), It.IsAny<string>(), "b", It.IsAny<CancellationToken>()), Times.Once);
        RequestContextAccessor.Clear();
    }

    [Fact]
    public async Task GetItemsBatch_StopsAtMaxDocs_AndAtTheByteCap_AlwaysAtLeastOneDoc()
    {
        var docs = Enumerable.Range(0, 30).Select(i => new BsonDocument { { "_id", i }, { "Pad", new string('p', 1000) } }).ToList();
        await _repo.InsertManyAsync("Batch", docs);
        var size = docs[0].ToBson().Length;

        var byCount = await _repo.GetItemsBatchAsync("Batch", new BsonDocument(), new BsonDocument("_id", 1), 10, long.MaxValue);
        byCount.Documents.Should().HaveCount(10);
        byCount.Documents.Select(d => d["_id"].AsInt32).Should().Equal(Enumerable.Range(0, 10));
        byCount.Sizes.Should().AllSatisfy(x => x.Should().Be(size));
        byCount.TotalBytes.Should().Be(10L * size);

        var byBytes = await _repo.GetItemsBatchAsync("Batch", new BsonDocument(), new BsonDocument("_id", 1), 500, size * 3 + 1);
        byBytes.Documents.Should().HaveCount(3);
        byBytes.TotalBytes.Should().BeLessThanOrEqualTo(size * 3 + 1);

        var tiny = await _repo.GetItemsBatchAsync("Batch", new BsonDocument(), new BsonDocument("_id", 1), 500, 1);
        tiny.Documents.Should().ContainSingle("always at least one doc");
    }
}
