using System.Collections;
using System.Diagnostics;
using System.Reflection;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.DataSources;

/// <summary>
/// Driver client lifetime on the real throwaway Mongo with the real driver (data SPEC1 §12 "Driver lifetime", B1;
/// R-DRV-UNREGISTER, R-DRV-SHARED, R-DRV-GROWTH, R-DRV-DISPOSED, R-SEC-REGISTRY). Registry and connection checks
/// look only at the clusters / connections of the entry under test (its own appName), so parallel tests do not
/// change the numbers.
/// </summary>
[Collection("Mongo")]
public class DataSourceDriverLifetimeTests
{
    private readonly MongoFixture _fixture;
    private readonly string _connectionString;
    private readonly ManualTimeProvider _clock = new();

    public DataSourceDriverLifetimeTests(MongoFixture fixture)
    {
        _fixture = fixture;
        var server = fixture.Client.Settings.Server;
        _connectionString = $"mongodb://{server.Host}:{server.Port}/";
    }

    private sealed class ValueResolver(string value) : IDataSourceSecretResolver
    {
        public Task<string?> ResolveAsync(string tenantId, string? secretId, CancellationToken cancellationToken = default) => Task.FromResult<string?>(value);
        public Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation, string? serviceUserId = null) => throw new NotSupportedException();
    }

    private DataSourceClientCache Cache() => new(
        new ValueResolver(_connectionString),
        new DataSourceClientFactory(new ActivitySource("drv-test")),
        new DriverClusterRegistry(),
        NullLogger<DataSourceClientCache>.Instance,
        _clock,
        startSweeper: false);

    private static List<ICluster> RegisteredClusters()
    {
        var registry = ClusterRegistry.Instance;
        var lockObj = typeof(ClusterRegistry).GetField("_lock", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(registry)!;
        var dict = (IDictionary)typeof(ClusterRegistry).GetField("_registry", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(registry)!;
        lock (lockObj)
            return dict.Values.Cast<ICluster>().ToList();
    }

    private static string AppNameOf(DataSourceClientCache.Entry entry) =>
        ((MongoClient)entry.Client).Settings.ApplicationName;

    private async Task<int> ConnectionsOfAppAsync(string appName)
    {
        var admin = _fixture.Client.GetDatabase("admin");
        var pipeline = new[]
        {
            new BsonDocument("$currentOp", new BsonDocument { { "allUsers", true }, { "idleConnections", true } }),
            new BsonDocument("$match", new BsonDocument("appName", appName)),
            new BsonDocument("$count", "n")
        };
        var result = await (await admin.AggregateAsync<BsonDocument>(pipeline)).FirstOrDefaultAsync();
        return result?["n"].ToInt32() ?? 0;
    }

    private static async Task<DataSourceClientCache.Entry> EntryAsync(DataSourceClientCache cache, string tenant, string version = "v1")
    {
        var key = new DataSourceClientCache.Key(tenant, "0123456789abcdef0123456789abcdef", version, "drvtest");
        return await cache.PeekLazy(key)!.Value;
    }

    private static async Task UseAsync(IMongoDatabase db)
    {
        var c = db.GetCollection<BsonDocument>("drv_" + Guid.NewGuid().ToString("N")[..8]);
        await c.InsertOneAsync(new BsonDocument("x", 1));
        (await c.CountDocumentsAsync(new BsonDocument())).Should().Be(1);
    }

    private async Task WaitForConnectionsAsync(string appName, Func<int, bool> condition)
    {
        for (var i = 0; i < 50 && !condition(await ConnectionsOfAppAsync(appName)); i++)
            await Task.Delay(100);
    }

    [Fact]
    public async Task RetireAndGrace_UnregistersTheCluster_AndClosesItsConnections()
    {
        using var cache = Cache();
        var db = await cache.GetAsync("drv-a", "0123456789abcdef0123456789abcdef", "v1", "drvtest", CancellationToken.None);
        await UseAsync(db);
        var entry = await EntryAsync(cache, "drv-a");
        var appName = AppNameOf(entry);
        RegisteredClusters().Should().Contain(entry.Cluster);
        (await ConnectionsOfAppAsync(appName)).Should().BeGreaterThan(0);

        cache.Release("drv-a");
        _clock.Advance(DataSourceClientCache.Grace);
        await cache.SweepAsync();

        RegisteredClusters().Should().NotContain(entry.Cluster, "the credential leaves the driver's static registry");
        await WaitForConnectionsAsync(appName, n => n == 0);
        (await ConnectionsOfAppAsync(appName)).Should().Be(0);
    }

    [Fact]
    public async Task TwoEntriesSameValue_RetireOne_TheOtherAndAGenesisStyleClientKeepWorking()
    {
        using var cache = Cache();
        var dbA = await cache.GetAsync("drv-a", "0123456789abcdef0123456789abcdef", "v1", "drvtest", CancellationToken.None);
        var dbB = await cache.GetAsync("drv-b", "0123456789abcdef0123456789abcdef", "v1", "drvtest", CancellationToken.None);
        var a = await EntryAsync(cache, "drv-a");
        var b = await EntryAsync(cache, "drv-b");
        a.Cluster.Should().NotBeSameAs(b.Cluster, "a unique ApplicationName gives every entry its own cluster");
        AppNameOf(a).Should().NotBe(AppNameOf(b));

        var genesisSettings = MongoClientSettings.FromConnectionString(_connectionString);
        genesisSettings.ClusterConfigurator = _ => { };
        using var genesisStyle = new MongoClient(genesisSettings);
        await UseAsync(genesisStyle.GetDatabase("drvtest"));

        cache.Release("drv-a");
        _clock.Advance(DataSourceClientCache.Grace);
        await cache.SweepAsync();

        await UseAsync(dbB);
        await UseAsync(genesisStyle.GetDatabase("drvtest"));
        RegisteredClusters().Should().Contain(b.Cluster);
        RegisteredClusters().Should().NotContain(a.Cluster);
        _ = dbA;
    }

    [Fact]
    public async Task TenAgeOutCycles_NoRegistryOrConnectionGrowth()
    {
        using var cache = Cache();
        var ours = new List<ICluster>();
        var apps = new List<string>();
        for (var i = 0; i < 10; i++)
        {
            var db = await cache.GetAsync("drv-c", "0123456789abcdef0123456789abcdef", "v1", "drvtest", CancellationToken.None);
            await UseAsync(db);
            var e = await EntryAsync(cache, "drv-c");
            ours.Add(e.Cluster);
            apps.Add(AppNameOf(e));
            _clock.Advance(DataSourceClientCache.MaxAge);
            await cache.SweepAsync();               // retire (age >= 15 min)
            _clock.Advance(DataSourceClientCache.Grace);
            await cache.SweepAsync();               // dispose + unregister
        }

        ours.Distinct().Should().HaveCount(10);
        RegisteredClusters().Intersect(ours).Should().BeEmpty("every retired cluster left the registry: no growth");
        foreach (var app in apps)
            await WaitForConnectionsAsync(app, n => n == 0);
        var open = 0;
        foreach (var app in apps)
            open += await ConnectionsOfAppAsync(app);
        open.Should().Be(0);
    }

    [Fact]
    public async Task ANewCallOnARetiredClientAfterTheGrace_ThrowsObjectDisposed()
    {
        using var cache = Cache();
        var db = await cache.GetAsync("drv-d", "0123456789abcdef0123456789abcdef", "v1", "drvtest", CancellationToken.None);
        await UseAsync(db);

        cache.Release("drv-d");
        _clock.Advance(DataSourceClientCache.Grace);
        await cache.SweepAsync();

        var act = () => db.GetCollection<BsonDocument>("after").InsertOneAsync(new BsonDocument("x", 1));
        await act.Should().ThrowAsync<ObjectDisposedException>();
    }
}
