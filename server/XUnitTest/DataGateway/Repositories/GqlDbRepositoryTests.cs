using Blocks.Genesis;
using DataGateway.DomainService;
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
    private readonly GqlDbRepository _repo;

    public GqlDbRepositoryTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _db = fixture.CreateDatabase();
        // Ensure tenant resolution yields empty so the repository falls back to GetDatabase(tenantId).
        BlocksContext.SetContext(null);
        RequestContextAccessor.Clear();
        _cache.Setup(c => c.GetHashValue(It.IsAny<string>())).Returns(Array.Empty<HashEntry>());

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        _repo = new GqlDbRepository(provider.Object, _cache.Object);
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
    public async Task GetDatabaseInfo_UsesCachedConnectionString()
    {
        // Drive the cache-backed database resolution path (tenant present, cache hit).
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-x" };
        var conn = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"mongodb://127.0.0.1/"));
        _cache.Setup(c => c.GetHashValue("tenant-x")).Returns(new[]
        {
            new HashEntry("DbConnectionString", conn),
            new HashEntry("DatabaseName", "somedb")
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
        provider.Setup(p => p.GetDatabase("custom-connection", custom.DatabaseNamespace.DatabaseName, true))
            .Returns(custom);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValue(It.IsAny<string>())).Returns(Array.Empty<HashEntry>());
        cache.Setup(c => c.GetHashValue("custom-tenant")).Returns(new[]
        {
            new HashEntry("DbConnectionString", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("custom-connection"))),
            new HashEntry("DatabaseName", custom.DatabaseNamespace.DatabaseName)
        });
        var repository = new GqlDbRepository(provider.Object, cache.Object);
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
}
