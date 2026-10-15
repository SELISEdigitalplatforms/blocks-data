using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// DataSourceConfigStore (read-only runtime path) + DataGatewayConfigurationService analytics read, on a real
/// throwaway Mongo (root DB only), a real DataSourceSecretResolver and an in-memory secret service. The config API
/// and the first-use create live in blocks-os: a missing root doc fails closed here and nothing is ever created.
/// </summary>
[Collection("Mongo")]
public class DataGatewayConfigurationServiceTests
{
    private const string Tenant = "tenant-a";
    private const string ProjectKey = "tenant-a";
    private const string Custom = "mongodb://user:S3cr3tPass@byo-host:27017/?authSource=admin";
    private const string Custom2 = "mongodb://user:OtherPass@byo-host2:27017/";

    private readonly IMongoDatabase _rootDb;
    private readonly DbRepository _realRepo;
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<ICacheClient> _cache = new();
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();
    private readonly System.Collections.Concurrent.ConcurrentQueue<string> _sequence = new();

    public DataGatewayConfigurationServiceTests(MongoFixture fixture)
    {
        _rootDb = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(fixture.CreateDatabase());
        provider.Setup(p => p.GetDatabase("root-cs", "BlocksRootDb", It.IsAny<bool>())).Returns(_rootDb);
        var blocksSecret = new Mock<IBlocksSecret>();
        blocksSecret.Setup(s => s.DatabaseConnectionString).Returns("root-cs");
        blocksSecret.Setup(s => s.RootDatabaseName).Returns("BlocksRootDb");
        _realRepo = new DbRepository(provider.Object, blocksSecret.Object);

        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataServiceConfiguration>>(), It.IsAny<string>()))
            .Returns((FilterDefinition<DataServiceConfiguration> f, string db) => _realRepo.GetItemAsync(f, db));
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataServiceConfiguration>(), It.IsAny<string>()))
            .Returns((DataServiceConfiguration d, string db) => _realRepo.InsertAsync(d, db));
        _repo.Setup(r => r.FindOneAndUpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<UpdateDefinition<BsonDocument>>(), It.IsAny<bool>(), It.IsAny<string>()))
            .Returns((string c, BsonDocument f, UpdateDefinition<BsonDocument> u, bool up, string db) =>
            {
                _sequence.Enqueue("root-update");
                return _realRepo.FindOneAndUpdateAsync(c, f, u, up, db);
            });

        _cache.Setup(c => c.KeyExistsAsync(It.IsAny<string>())).Callback(() => _sequence.Enqueue("redis-exists")).ReturnsAsync(true);
        _cache.Setup(c => c.RemoveKeyAsync(It.IsAny<string>())).Callback(() => _sequence.Enqueue("redis-remove")).ReturnsAsync(true);
        _cache.Setup(c => c.AddHashValueAsync(It.IsAny<string>(), It.IsAny<IEnumerable<HashEntry>>()))
            .Callback(() => _sequence.Enqueue("redis-addhash")).ReturnsAsync(true);


        _secrets.BeforeCall = (op, _) =>
        {
            _sequence.Enqueue("secret-" + op);
            return Task.CompletedTask;
        };
    }

    private DataSourceConfigStore Store() =>
        new(_repo.Object, _cache.Object, _secrets.Resolver(), _logs.CreateLogger<DataSourceConfigStore>());

    private DataGatewayConfigurationService Service() =>
        new(Store());

    private static void AsAdmin(string tenant = Tenant) => BlocksTestContext.Set(userId: "admin-1", tenantId: tenant);

    private IMongoCollection<BsonDocument> RootColl => _rootDb.GetCollection<BsonDocument>("DataServiceConfigurations");

    private Task<BsonDocument> RootAsync(string tenant = Tenant) => RootColl.Find(new BsonDocument("_id", tenant)).FirstAsync();

    private IEnumerable<FakeSecretService.Stored> Own(string tenant = Tenant) => _secrets.Secrets.Values.Where(s => s.TenantId == tenant);

    private async Task SeedRootAsync(string secretId, string tenant = Tenant, bool deleted = false, AnalyticsConfiguration? analytics = null)
    {
        var doc = new BsonDocument
        {
            { "_id", tenant }, { "TenantId", tenant }, { "DatabaseName", "byo-db" }, { "IsDeleted", deleted },
            { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" },
            { "LastUpdatedDate", DateTime.UtcNow.AddHours(-1) },
            { "DbConnectionSecretId", secretId }
        };
        if (analytics is not null) doc["AnalyticsConfiguration"] = analytics.ToBsonDocument();
        await RootColl.InsertOneAsync(doc);
    }

    /// <summary>Root doc + a secret with <paramref name="value"/> in the given state.</summary>
    private async Task<string> SeedAsync(string value, string status = SecretStatuses.Active, string tenant = Tenant)
    {
        var secret = _secrets.Add(tenant, value, status);
        await SeedRootAsync(secret.Id, tenant);
        return secret.Id;
    }

    private List<HashEntry[]> CapturedHashes() =>
        _cache.Invocations.Where(i => i.Method.Name == nameof(ICacheClient.AddHashValueAsync))
            .Select(i => ((IEnumerable<HashEntry>)i.Arguments[1]).ToArray()).ToList();

    // ---------------- runtime resolve source (store.LoadAsync) ----------------

    [Fact]
    public async Task Load_NoRootDoc_FailsClosed_NothingCreated_NoHash()
    {
        AsAdmin();

        var act = () => Store().LoadAsync(Tenant);

        var ex = await act.Should().ThrowAsync<DataSourceUnavailableException>();
        ex.Which.Message.Should().Contain("does not exist");
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        _secrets.Calls.Should().BeEmpty();
        CapturedHashes().Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Level == Microsoft.Extensions.Logging.LogLevel.Error && l.Message.Contains("root-doc-missing"));
    }

    [Fact]
    public async Task Load_SoftDeletedRootDoc_FailsClosed_NothingCreated()
    {
        AsAdmin();
        await SeedRootAsync("some-secret", deleted: true);

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
        (await RootColl.CountDocumentsAsync(new BsonDocument())).Should().Be(1);
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Load_Default_RebuildsTheHash_ExactShape_AndNeverWritesTheRootDoc()
    {
        AsAdmin();
        var id = await SeedAsync("default");
        var before = await RootAsync();

        var route = await Store().LoadAsync(Tenant);

        route.IsCustom.Should().BeFalse();
        route.SecretId.Should().Be(id);
        var hash = CapturedHashes().Single();
        hash.Select(e => e.Name.ToString()).Should().BeEquivalentTo(["DbConnectionSecretId", "DatabaseName", "ConnectionType", "Version"]);
        hash.Single(e => e.Name == "ConnectionType").Value.ToString().Should().Be("Default");
        hash.Single(e => e.Name == "Version").Value.ToString().Should().Be(route.Version);
        _cache.Verify(c => c.AddHashValueAsync(Tenant, It.IsAny<IEnumerable<HashEntry>>()), Times.Once);
        (await RootAsync()).ToJson().Should().Be(before.ToJson());
        _secrets.Calls.Should().NotContain(c => c.Op == "Set" || c.Op == "Rotate" || c.Op == "Delete");
    }

    [Fact]
    public async Task Load_OtherTenantsRootDoc_IsNeverRead()
    {
        AsAdmin();
        await SeedAsync(Custom, tenant: "tenant-b");

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
    }

    [Fact]
    public async Task Load_Custom_AnswersCustom_WithSecretIdAndDbName_NoValueInRouteOrHash()
    {
        AsAdmin();
        var id = await SeedAsync(Custom);

        var route = await Store().LoadAsync(Tenant);

        route.IsCustom.Should().BeTrue();
        route.SecretId.Should().Be(id);
        route.DatabaseName.Should().Be("byo-db");
        route.ToString().Should().NotContain("S3cr3tPass");
        CapturedHashes().Single().Select(e => e.Value.ToString()).Should().NotContain(v => v.Contains("S3cr3tPass"));
    }

    [Theory]
    [InlineData("Deleted")]
    [InlineData("Locked")]
    [InlineData("Missing")]
    [InlineData("NoValue")]
    public async Task Load_BrokenSecret_FailsClosed_NoHashWritten(string state)
    {
        AsAdmin();
        if (state == "Missing") await SeedRootAsync("no-such-secret");
        else
        {
            var id = await SeedAsync("default", state == "Deleted" ? SecretStatuses.Deleted : state == "Locked" ? SecretStatuses.Locked : SecretStatuses.Active);
            if (state == "NoValue") _secrets.Secrets[id].Value = null;
        }

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
        CapturedHashes().Should().BeEmpty();
        Own().Count().Should().BeLessThanOrEqualTo(1, "a broken secret is never silently replaced at runtime");
    }

    [Fact]
    public async Task Load_RootDocWithoutSecretId_FailsClosed()
    {
        AsAdmin();
        await SeedRootAsync(string.Empty);

        var act = () => Store().LoadAsync(Tenant);

        await act.Should().ThrowAsync<DataSourceUnavailableException>();
    }

    // ---------------- ANALYTICS ----------------

    [Fact]
    public async Task CanAccessAnalytics_ReadsTheCallersOwnRootDoc_NotAnotherTenants_NeverCreates()
    {
        AsAdmin("root-tenant");
        var open = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-1), ValidTill = DateTime.UtcNow.AddDays(1) };
        var closed = new AnalyticsConfiguration { EnableAnalytics = true, EnableDate = DateTime.UtcNow.AddDays(-3), ValidTill = DateTime.UtcNow.AddDays(-1) };
        await SeedRootAsync("s1", tenant: "other-1", analytics: open);
        await SeedRootAsync("s2", tenant: "root-tenant", analytics: closed);

        (await Service().CanAccessAnalyticsAsync()).Should().BeFalse();
        AsAdmin("other-1");
        (await Service().CanAccessAnalyticsAsync()).Should().BeTrue();

        AsAdmin("no-doc-tenant");
        (await Service().CanAccessAnalyticsAsync()).Should().BeFalse();
        (await RootColl.CountDocumentsAsync(new BsonDocument("_id", "no-doc-tenant"))).Should().Be(0);
        _secrets.Calls.Should().BeEmpty();
    }

}
