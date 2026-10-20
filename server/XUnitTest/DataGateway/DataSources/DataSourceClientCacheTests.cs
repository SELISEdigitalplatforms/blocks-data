using System.Collections.Concurrent;
using System.Diagnostics;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;
using MongoDB.Driver.Core.Configuration;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.DataSources;

/// <summary>
/// DataSourceClientCache unit tests (data SPEC1 §3.5.4; §12 "Client cache", "Races", "Settings", "Dispose order",
/// "Cache remove races"): fake clock, fake resolver, fake client factory, fake cluster registry.
/// Invariant checked in every test that builds clients: clients built = disposed + live.
/// </summary>
public class DataSourceClientCacheTests
{
    private const string T = "tenant-1";
    private const string Sid = "0123456789abcdef0123456789abcdef";
    private const string Value = "mongodb://user:TopSecretPw@byo:27017/";

    private readonly ManualTimeProvider _clock = new();
    private readonly FakeResolver _resolver = new();
    private readonly FakeFactory _factory;
    private readonly FakeRegistry _registry = new();
    private readonly RecordingLoggerProvider _logs = new();

    public DataSourceClientCacheTests()
    {
        _factory = new FakeFactory(_registry);
    }

    private DataSourceClientCache Cache() =>
        new(_resolver, _factory, _registry, _logs.CreateLogger<DataSourceClientCache>(), _clock, startSweeper: false);

    private static DataSourceClientCache.Key K(string version = "v1", string db = "db1") => new(T, Sid, version, db);

    private void AssertInvariant(DataSourceClientCache cache)
    {
        var live = _factory.Built.Count(c => c.DisposeCount == 0);
        (_factory.Built.Count(c => c.DisposeCount == 1) + live).Should().Be(_factory.Built.Count);
        _factory.Built.Should().AllSatisfy(c => c.DisposeCount.Should().BeLessThanOrEqualTo(1, "no client is retired twice"));
        live.Should().BeLessThanOrEqualTo(cache.EntryCount + cache.RetiredCount);
    }

    // ---------------- hit / miss / age ----------------

    [Fact]
    public async Task Hit_ReadsNoSecret()
    {
        var cache = Cache();
        var db1 = await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        for (var i = 0; i < 5; i++)
            (await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None)).Should().BeSameAs(db1);
        _resolver.Calls.Should().Be(1);
        _factory.Built.Should().HaveCount(1);
    }

    [Fact]
    public async Task HundredParallelMisses_OneSecretRead()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        var tasks = Enumerable.Range(0, 100).Select(_ => Task.Run(() => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None))).ToList();
        await Task.Delay(100);
        _resolver.Gate.SetResult();
        var dbs = await Task.WhenAll(tasks);
        dbs.Distinct().Should().HaveCount(1);
        _resolver.Calls.Should().Be(1);
        _factory.Built.Should().HaveCount(1);
    }

    [Fact]
    public async Task Age1459_Hit_1500_Miss_OldRetired()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15) - TimeSpan.FromSeconds(1));
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _resolver.Calls.Should().Be(1);

        _clock.Advance(TimeSpan.FromSeconds(1));
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        _resolver.Calls.Should().Be(2);
        cache.EntryCount.Should().Be(1);
        cache.RetiredCount.Should().Be(1);
        AssertInvariant(cache);
    }

    [Fact]
    public async Task NewVersion_OneRead_OldRetired_DisposedOnlyAfterTheGrace_ThenUnregistered()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        var old = _factory.Built[0];

        await cache.GetAsync(T, Sid, "v2", "db1", CancellationToken.None);
        _resolver.Calls.Should().Be(2);
        cache.PeekLazy(K("v1")).Should().BeNull("the old entry leaves the dictionary at once");

        _clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromSeconds(1));
        await cache.SweepAsync();
        old.DisposeCount.Should().Be(0, "not before the 5 min grace");

        _clock.Advance(TimeSpan.FromSeconds(1));
        await cache.SweepAsync();
        old.DisposeCount.Should().Be(1);
        _registry.Unregistered.Should().ContainSingle().Which.Should().BeSameAs(old.Cluster);
        _registry.Order.Should().Equal("dispose:" + old.Id, "unregister:" + old.Id);
        _factory.Built[1].DisposeCount.Should().Be(0);
        AssertInvariant(cache);
    }

    [Fact]
    public async Task OtherDatabaseName_IsAKeyChange()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        await cache.GetAsync(T, Sid, "v1", "db2", CancellationToken.None);
        _resolver.Calls.Should().Be(2);
        cache.RetiredCount.Should().Be(1);
    }

    [Fact]
    public async Task Release_RetiresTheCurrentClient()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        cache.Release(T);
        cache.Release("unknown-tenant");

        cache.EntryCount.Should().Be(0);
        cache.RetiredCount.Should().Be(1);
        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync();
        _factory.Built[0].DisposeCount.Should().Be(1);
    }

    [Fact]
    public async Task Sweeper_RetiresAnIdle15MinEntry_DisposesItAfterTheGrace()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        _clock.Advance(TimeSpan.FromMinutes(15));
        await cache.SweepAsync();
        cache.EntryCount.Should().Be(0);
        _factory.Built[0].DisposeCount.Should().Be(0);

        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync();
        _factory.Built[0].DisposeCount.Should().Be(1);
        _registry.Unregistered.Should().HaveCount(1);
    }

    [Fact]
    public async Task SweeperTimer_FiresEvery60s()
    {
        using var cache = new DataSourceClientCache(_resolver, _factory, _registry, _logs.CreateLogger<DataSourceClientCache>(), _clock);
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        for (var i = 0; i < 16; i++)
            _clock.Advance(TimeSpan.FromSeconds(60));
        await Task.Delay(50);

        cache.EntryCount.Should().Be(0, "the timer-driven sweeper retired the aged entry within ~16 min");
    }

    [Fact]
    public async Task MissFailure_IsNotCached_NextCallTriesAgain()
    {
        var cache = Cache();
        _resolver.FailNext = new DataSourceUnavailableException("Secret 'x' was not found.", new SecretNotFoundException("x"));

        var act = () => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which.Message.Should().Be("Secret 'x' was not found.");
        cache.EntryCount.Should().Be(0);

        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _resolver.Calls.Should().Be(2);
    }

    [Fact]
    public void Key_HoldsNoConnectionString_FourFields()
    {
        var props = typeof(DataSourceClientCache.Key).GetProperties();
        props.Select(p => p.Name).Should().BeEquivalentTo("TenantId", "SecretId", "Version", "DatabaseName");
        typeof(DataSourceClientCache).GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
            .Should().NotContain(f => f.FieldType == typeof(string), "the cache keeps no string field (no value)");
    }

    [Fact]
    public async Task AfterALoad_NoKeyAndNoLogHoldsTheValue()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        K().ToString().Should().NotContain("TopSecretPw");
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("TopSecretPw"));
    }

    [Fact]
    public async Task AppStop_DisposesLiveAndRetired_AndUnregisters()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        await cache.GetAsync(T, Sid, "v2", "db1", CancellationToken.None);

        cache.Dispose();

        _factory.Built.Should().AllSatisfy(c => c.DisposeCount.Should().Be(1));
        _registry.Unregistered.Should().HaveCount(2);
    }

    // ---------------- build ----------------

    [Fact]
    public async Task ClientBuildError_FixedMessage_NoPasswordInMessageOrLogs()
    {
        var cache = Cache();
        _factory.ThrowOnBuild = new MongoConfigurationException($"The connection string '{Value}' is not valid.");

        var act = () => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        var ex = (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which;
        ex.Message.Should().Be("The data source of this project is not available.");
        ex.ToString().Should().NotContain("TopSecretPw");
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("TopSecretPw"));
        _logs.Logs.Should().Contain(l => l.Message.Contains("MongoConfigurationException"));
        cache.EntryCount.Should().Be(0);
    }

    // ---------------- races (S1, review 3 M4) ----------------

    [Fact]
    public async Task AgeOut_HundredParallelCallers_OneRead_OneNewClient_OldRetiredOnce()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));
        _resolver.Gate = new TaskCompletionSource();

        var tasks = Enumerable.Range(0, 100).Select(_ => Task.Run(() => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None))).ToList();
        await Task.Delay(100);
        _resolver.Gate.SetResult();
        await Task.WhenAll(tasks);

        _resolver.Calls.Should().Be(2);
        _factory.Built.Should().HaveCount(2);
        cache.RetiredCount.Should().Be(1);
        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync();
        _factory.Built[0].DisposeCount.Should().Be(1);
        _factory.Built[1].DisposeCount.Should().Be(0);
        AssertInvariant(cache);
    }

    [Fact]
    public async Task FailingMiss_RemovesOnlyItsOwnLazy_ANewerGoodEntryStays()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        _resolver.FailNext = new DataSourceUnavailableException("vault down", new SecretVaultException("vault down", "get", Sid));
        var failing = cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        await Task.Delay(50);

        var newer = new Lazy<Task<DataSourceClientCache.Entry>>(() => Task.FromResult(new DataSourceClientCache.Entry
        {
            Client = Mock.Of<IMongoClient>(), Cluster = Mock.Of<ICluster>(), Database = Mock.Of<IMongoDatabase>(), CreatedUtc = _clock.GetUtcNow().UtcDateTime
        }));
        _ = newer.Value;
        cache.SetLazyForTest(K(), newer);
        _resolver.Gate.SetResult();

        await FluentActions.Awaiting(() => failing).Should().ThrowAsync<DataSourceUnavailableException>();
        cache.PeekLazy(K()).Should().BeSameAs(newer);
    }

    [Fact]
    public async Task AbortedCaller_StopsWaiting_OthersGetTheDatabase()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        using var cts = new CancellationTokenSource();
        var c1 = cache.GetAsync(T, Sid, "v1", "db1", cts.Token);
        var c2 = cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        var c3 = cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);

        cts.Cancel();
        await FluentActions.Awaiting(() => c1).Should().ThrowAsync<OperationCanceledException>();
        _resolver.Gate.SetResult();

        (await c2).Should().BeSameAs(await c3);
        _resolver.Calls.Should().Be(1);
    }

    [Fact]
    public async Task LoadTimeout30s_AllWaitersFail_EntryRemoved()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        var waiters = Enumerable.Range(0, 3).Select(_ => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None)).ToList();
        await Task.Delay(100);

        _clock.Advance(TimeSpan.FromSeconds(31));

        foreach (var w in waiters)
            (await FluentActions.Awaiting(() => w).Should().ThrowAsync<DataSourceUnavailableException>()).Which.Message.Should().Contain("timed out");
        cache.EntryCount.Should().Be(0);
        _resolver.Gate.SetResult();
    }

    [Fact]
    public async Task LoadThatBuiltAClientThenTimedOut_DisposesAndUnregistersAtOnce()
    {
        var cache = Cache();
        _factory.OnBuild = () => _clock.Advance(TimeSpan.FromSeconds(31));

        await FluentActions.Awaiting(() => cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None))
            .Should().ThrowAsync<DataSourceUnavailableException>();

        _factory.Built.Should().ContainSingle().Which.DisposeCount.Should().Be(1);
        _registry.Unregistered.Should().ContainSingle();
        cache.EntryCount.Should().Be(0);
        AssertInvariant(cache);
    }

    [Fact]
    public async Task Sweeper_TickWhileTheLastRunIsRunning_IsSkipped()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        cache.Release(T);
        _clock.Advance(TimeSpan.FromMinutes(5));
        using var entered = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        _registry.OnUnregister = () => { entered.Set(); release.Wait(TimeSpan.FromSeconds(10)); };

        var run1 = Task.Run(() => cache.SweepAsync());
        entered.Wait(TimeSpan.FromSeconds(10)).Should().BeTrue();
        await cache.SweepAsync();
        _logs.Logs.Should().Contain(l => l.Level == LogLevel.Debug && l.Message.Contains("skipped"));
        run1.IsCompleted.Should().BeFalse();

        release.Set();
        await run1;
        _factory.Built.Should().ContainSingle().Which.DisposeCount.Should().Be(1);
        _registry.Unregistered.Should().ContainSingle();
    }

    [Fact]
    public async Task RetiringAnUnfinishedLazy_AwaitsItThenDisposes()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        var loading = cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        await Task.Delay(50);
        cache.Release(T);

        var stop = Task.Run(cache.Dispose); // app stop retires everything, also the unfinished load
        await Task.Delay(100);
        stop.IsCompleted.Should().BeFalse("the unfinished load is awaited (bounded by its 30 s timeout)");
        _resolver.Gate.SetResult();
        await stop;
        await loading;

        _factory.Built.Should().ContainSingle().Which.DisposeCount.Should().Be(1);
        _registry.Unregistered.Should().ContainSingle();
    }

    [Fact]
    public async Task RetiredFaultedLazy_IsSkipped()
    {
        var cache = Cache();
        _resolver.Gate = new TaskCompletionSource();
        _resolver.FailNext = new DataSourceUnavailableException("nope");
        var loading = cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        await Task.Delay(50);
        cache.Release(T);
        _resolver.Gate.SetResult();
        await FluentActions.Awaiting(() => loading).Should().ThrowAsync<DataSourceUnavailableException>();

        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync();

        _factory.Built.Should().BeEmpty();
        cache.RetiredCount.Should().Be(0);
    }

    [Fact]
    public async Task SwapWinnerRetires_SweeperSeesTheNewEntry_OldDisposedExactlyOnce()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));

        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None); // swap: B in, A retired by the winner
        await cache.SweepAsync();                                          // B is young: stays
        cache.EntryCount.Should().Be(1);

        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync();
        await cache.SweepAsync();
        _factory.Built[0].DisposeCount.Should().Be(1);
        _factory.Built[1].DisposeCount.Should().Be(0, "B is never disposed early");
        AssertInvariant(cache);
    }

    [Fact]
    public async Task ReleaseAndKeyChangeAndAgeOut_Racing_NoLeak_NoDoubleRetire()
    {
        var cache = Cache();
        await cache.GetAsync(T, Sid, "v1", "db1", CancellationToken.None);
        _clock.Advance(TimeSpan.FromMinutes(15));

        var work = new List<Task>();
        for (var i = 0; i < 50; i++)
        {
            var v = i % 3 == 0 ? "v2" : "v1";
            work.Add(Task.Run(() => cache.GetAsync(T, Sid, v, "db1", CancellationToken.None)));
            work.Add(Task.Run(() => cache.Release(T)));
            work.Add(Task.Run(() => cache.SweepAsync()));
        }
        await Task.WhenAll(work);

        _clock.Advance(TimeSpan.FromMinutes(16));
        await cache.SweepAsync(); // retires what is left (age >= 15 min)
        _clock.Advance(TimeSpan.FromMinutes(5));
        await cache.SweepAsync(); // disposes everything past its grace
        _factory.Built.Should().AllSatisfy(c => c.DisposeCount.Should().BeLessThanOrEqualTo(1));
        var live = _factory.Built.Count(c => c.DisposeCount == 0);
        live.Should().Be(0, "~21 min after the last request every client was retired and disposed");
        cache.EntryCount.Should().Be(0);
        cache.RetiredCount.Should().Be(0);
    }

    // ---------------- settings (S2) ----------------

    [Fact]
    public void Settings_AreGenesisSettings_PlusAUniqueApplicationName()
    {
        using var source = new ActivitySource("test");
        var a = DataSourceClientFactory.BuildSettings(Value, source);
        var b = DataSourceClientFactory.BuildSettings(Value, source);

        a.RetryReads.Should().BeTrue();
        a.RetryWrites.Should().BeTrue();
        a.ServerSelectionTimeout.Should().Be(TimeSpan.FromSeconds(15));
        a.ConnectTimeout.Should().Be(TimeSpan.FromSeconds(10));
        a.ClusterConfigurator.Should().NotBeNull();
        a.ApplicationName.Should().StartWith("blocks-data-ds-");
        b.ApplicationName.Should().NotBe(a.ApplicationName);
        a.ToString().Should().NotContain("TopSecretPw");

        var builder = new ClusterBuilder();
        a.ClusterConfigurator!(builder);
        ContainsSubscriber(builder).Should().BeTrue("the configurator subscribes Genesis' MongoEventSubscriber (Mongo spans)");
    }

    [Fact]
    public void Settings_ExistingAppNameIsReplaced()
    {
        using var source = new ActivitySource("test");
        DataSourceClientFactory.BuildSettings("mongodb://h:27017/?appName=customer", source).ApplicationName.Should().StartWith("blocks-data-ds-");
    }

    private static bool ContainsSubscriber(object root)
    {
        var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
        var stack = new Stack<object>();
        stack.Push(root);
        while (stack.Count > 0)
        {
            var o = stack.Pop();
            if (!seen.Add(o)) continue;
            if (o is Blocks.Genesis.MongoEventSubscriber) return true;
            if (o is System.Collections.IEnumerable list and not string)
                foreach (var item in list) if (item is not null) stack.Push(item);
            foreach (var f in o.GetType().GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public))
            {
                if (f.FieldType.IsPrimitive || f.FieldType == typeof(string)) continue;
                var v = f.GetValue(o);
                if (v is not null && !v.GetType().IsPrimitive) stack.Push(v);
            }
            if (seen.Count > 2000) break;
        }
        return false;
    }

    // ---------------- fakes ----------------

    internal sealed class FakeResolver : IDataSourceSecretResolver
    {
        private int _calls;
        private Exception? _failNext;
        public int Calls => _calls;
        public TaskCompletionSource? Gate { get; set; }
        public Exception? FailNext { get => _failNext; set => _failNext = value; }

        public async Task<string?> ResolveAsync(string tenantId, string? secretId, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _calls);
            var fail = Interlocked.Exchange(ref _failNext, null);
            if (Gate is not null)
                await Gate.Task;
            if (fail is not null) throw fail;
            return Value;
        }

        public Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation, string? serviceUserId = null) => throw new NotSupportedException();
    }

    internal sealed class FakeClient
    {
        private int _disposed;
        public required int Id { get; init; }
        public required Mock<IMongoClient> Mock { get; init; }
        public required ICluster Cluster { get; init; }
        public int DisposeCount => _disposed;
        public void MarkDisposed() => Interlocked.Increment(ref _disposed);
    }

    internal sealed class FakeFactory(FakeRegistry registry) : IDataSourceClientFactory
    {
        private int _next;
        private readonly ConcurrentQueue<FakeClient> _built = new();
        public List<FakeClient> Built => _built.ToList();
        public Exception? ThrowOnBuild { get; set; }
        public Action? OnBuild { get; set; }

        public (IMongoClient Client, ICluster Cluster) Build(string connectionString)
        {
            connectionString.Should().Be(Value);
            if (ThrowOnBuild is not null) throw ThrowOnBuild;
            var id = Interlocked.Increment(ref _next);
            var mock = new Mock<IMongoClient>();
            var cluster = new Mock<ICluster>().Object;
            var fake = new FakeClient { Id = id, Mock = mock, Cluster = cluster };
            mock.Setup(m => m.Dispose()).Callback(() => { fake.MarkDisposed(); registry.Record("dispose:" + id); });
            mock.Setup(m => m.GetDatabase(It.IsAny<string>(), It.IsAny<MongoDatabaseSettings>())).Returns(Mock.Of<IMongoDatabase>());
            registry.Map(cluster, id);
            _built.Enqueue(fake);
            OnBuild?.Invoke();
            return (mock.Object, cluster);
        }
    }

    internal sealed class FakeRegistry : IClusterRegistry
    {
        private readonly ConcurrentDictionary<ICluster, int> _ids = new();
        private readonly ConcurrentQueue<string> _order = new();
        private readonly ConcurrentQueue<ICluster> _unregistered = new();
        public List<ICluster> Unregistered => _unregistered.ToList();
        public List<string> Order => _order.ToList();
        public void Map(ICluster c, int id) => _ids[c] = id;
        public void Record(string s) => _order.Enqueue(s);

        public Action? OnUnregister { get; set; }

        public void UnregisterAndDisposeCluster(ICluster cluster)
        {
            OnUnregister?.Invoke();
            _unregistered.Enqueue(cluster);
            _order.Enqueue("unregister:" + (_ids.TryGetValue(cluster, out var id) ? id : -1));
        }
    }
}
