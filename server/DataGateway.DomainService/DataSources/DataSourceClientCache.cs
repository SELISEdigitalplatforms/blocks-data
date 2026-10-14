using System.Collections.Concurrent;
using System.Diagnostics;
using Blocks.Genesis;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;

namespace DataGateway.DomainService.DataSources;

/// <summary>Open driver clients of BYO data sources (data SPEC1 §3.5.4).</summary>
public interface IDataSourceClientCache
{
    /// <summary>
    /// The database of the tenant's data source. Hit (entry younger than 15 min) = no secret read;
    /// miss = one secret read + one new client, shared by every request waiting on that key.
    /// </summary>
    /// <exception cref="DataSourceUnavailableException">The secret read, the load or the client build failed.</exception>
    Task<IMongoDatabase> GetAsync(string tenantId, string secretId, string version, string databaseName, CancellationToken requestToken);

    /// <summary>Retires the tenant's current client (the tenant switched back to the Blocks DB).</summary>
    void Release(string tenantId);
}

/// <summary>
/// Singleton. Owner exception of 2026-10-13: only the open driver client holds the connection string,
/// for at most 15 min (+ sweeper tick + 5 min grace). The key holds no connection string; no field of
/// this class holds a value. Every remove is a compare-and-remove on the instance the path read.
/// </summary>
public sealed class DataSourceClientCache : IDataSourceClientCache, IDisposable
{
    public static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan Grace = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan LoadTimeout = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan SweepInterval = TimeSpan.FromSeconds(60);

    /// <summary>Cache key: no connection string (only ids, the Redis version and the DB name).</summary>
    public readonly record struct Key(string TenantId, string SecretId, string Version, string DatabaseName);

    /// <summary>One open client. <see cref="Cluster"/> is kept at build time (<c>Client.Cluster</c> throws after Dispose).</summary>
    public sealed class Entry
    {
        public required IMongoClient Client { get; init; }
        public required ICluster Cluster { get; init; }
        public required IMongoDatabase Database { get; init; }
        public required DateTime CreatedUtc { get; init; }
    }

    private sealed record Retired(Lazy<Task<Entry>> Lazy, DateTime DisposeAt);

    private readonly ConcurrentDictionary<Key, Lazy<Task<Entry>>> _entries = new();
    private readonly ConcurrentDictionary<string, Key> _current = new(StringComparer.Ordinal);
    private readonly ConcurrentQueue<Retired> _retired = new();

    private readonly IDataSourceSecretResolver _resolver;
    private readonly IDataSourceClientFactory _clientFactory;
    private readonly IClusterRegistry _clusterRegistry;
    private readonly TimeProvider _time;
    private readonly ILogger<DataSourceClientCache> _logger;
    private readonly ITimer? _sweepTimer;
    private int _sweeping;
    private int _disposed;

    public DataSourceClientCache(
        IDataSourceSecretResolver resolver,
        IDataSourceClientFactory clientFactory,
        IClusterRegistry clusterRegistry,
        ILogger<DataSourceClientCache> logger,
        TimeProvider? timeProvider = null,
        bool startSweeper = true)
    {
        _resolver = resolver;
        _clientFactory = clientFactory;
        _clusterRegistry = clusterRegistry;
        _logger = logger;
        _time = timeProvider ?? TimeProvider.System;
        if (startSweeper)
            _sweepTimer = _time.CreateTimer(_ => _ = SweepAsync(), null, SweepInterval, SweepInterval);
    }

    private DateTime UtcNow => _time.GetUtcNow().UtcDateTime;

    /// <summary>Test view: number of entries in the dictionary.</summary>
    internal int EntryCount => _entries.Count;

    /// <summary>Test view: number of entries waiting for their dispose time.</summary>
    internal int RetiredCount => _retired.Count;

    /// <summary>Test view: the dictionary instance for a key.</summary>
    internal Lazy<Task<Entry>>? PeekLazy(Key key) => _entries.TryGetValue(key, out var lazy) ? lazy : null;

    /// <summary>Test hook: put an instance into the dictionary (race tests).</summary>
    internal void SetLazyForTest(Key key, Lazy<Task<Entry>> lazy) => _entries[key] = lazy;

    public async Task<IMongoDatabase> GetAsync(string tenantId, string secretId, string version, string databaseName, CancellationToken requestToken)
    {
        var key = new Key(tenantId, secretId, version ?? string.Empty, databaseName ?? string.Empty);
        TrackCurrentKey(key);

        Lazy<Task<Entry>> lazy;
        if (_entries.TryGetValue(key, out var seen))
        {
            lazy = seen;
            if (seen.IsValueCreated && seen.Value.IsCompletedSuccessfully)
            {
                var entry = seen.Value.Result;
                if (UtcNow - entry.CreatedUtc < MaxAge)
                    return entry.Database;

                // Aged: compare-and-swap. Only the winner retires the old entry (the swap IS its removal).
                var fresh = CreateLazy(key);
                if (_entries.TryUpdate(key, fresh, seen))
                {
                    EnqueueRetire(seen);
                    lazy = fresh;
                }
                else if (!_entries.TryGetValue(key, out lazy!))
                {
                    lazy = _entries.GetOrAdd(key, fresh);
                }
            }
        }
        else
        {
            lazy = _entries.GetOrAdd(key, CreateLazy(key));
        }

        var loaded = await lazy.Value.WaitAsync(requestToken).ConfigureAwait(false);
        return loaded.Database;
    }

    public void Release(string tenantId)
    {
        if (string.IsNullOrEmpty(tenantId))
            return;
        if (_current.TryGetValue(tenantId, out var seenKey)
            && _current.TryRemove(new KeyValuePair<string, Key>(tenantId, seenKey)))
        {
            RemoveAndRetire(seenKey);
        }
    }

    /// <summary>A request whose key differs from the tenant's current key retires the old entry.</summary>
    private void TrackCurrentKey(Key key)
    {
        while (true)
        {
            if (!_current.TryGetValue(key.TenantId, out var seenKey))
            {
                if (_current.TryAdd(key.TenantId, key))
                    return;
                continue;
            }

            if (seenKey == key)
                return;

            if (_current.TryUpdate(key.TenantId, key, seenKey))
            {
                RemoveAndRetire(seenKey);
                return;
            }
        }
    }

    private void RemoveAndRetire(Key key)
    {
        if (_entries.TryGetValue(key, out var seen)
            && _entries.TryRemove(new KeyValuePair<Key, Lazy<Task<Entry>>>(key, seen)))
        {
            EnqueueRetire(seen);
        }
    }

    private void EnqueueRetire(Lazy<Task<Entry>> lazy) =>
        _retired.Enqueue(new Retired(lazy, UtcNow + Grace));

    private Lazy<Task<Entry>> CreateLazy(Key key)
    {
        Lazy<Task<Entry>> lazy = null!;
        lazy = new Lazy<Task<Entry>>(() => StartDetachedLoad(key, () => lazy), LazyThreadSafetyMode.ExecutionAndPublication);
        return lazy;
    }

    /// <summary>The shared load is not tied to any request: no flowed context, own 30 s timeout.</summary>
    private Task<Entry> StartDetachedLoad(Key key, Func<Lazy<Task<Entry>>> self)
    {
        if (ExecutionContext.IsFlowSuppressed())
            return Task.Run(() => LoadAsync(key, self));

        using (ExecutionContext.SuppressFlow())
        {
            return Task.Run(() => LoadAsync(key, self));
        }
    }

    private async Task<Entry> LoadAsync(Key key, Func<Lazy<Task<Entry>>> self)
    {
        using var timeout = new CancellationTokenSource(LoadTimeout, _time);
        IMongoClient? client = null;
        ICluster? cluster = null;
        try
        {
            string? value;
            try
            {
                value = await _resolver.ResolveAsync(key.TenantId, key.SecretId, timeout.Token)
                    .WaitAsync(LoadTimeout, _time, timeout.Token).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is TimeoutException or OperationCanceledException)
            {
                throw new DataSourceUnavailableException($"Reading the data source secret timed out after {LoadTimeout.TotalSeconds:0} s.", new TimeoutException());
            }

            IMongoDatabase database;
            try
            {
                (client, cluster) = _clientFactory.Build(value ?? string.Empty);
                value = null;
                database = client.GetDatabase(key.DatabaseName);
            }
            catch (Exception ex)
            {
                // Never the driver's text: its parse message holds the whole connection string.
                _logger.LogWarning("[dsc] client-build-failed tenant={TenantId} secret={SecretId} error={ErrorType}",
                    key.TenantId, key.SecretId, ex.GetType().Name);
                throw new DataSourceUnavailableException(DataSourceUnavailableException.ClientBuildMessage);
            }

            if (timeout.IsCancellationRequested)
                throw new DataSourceUnavailableException($"Loading the data source timed out after {LoadTimeout.TotalSeconds:0} s.", new TimeoutException());

            return new Entry { Client = client, Cluster = cluster, Database = database, CreatedUtc = UtcNow };
        }
        catch (Exception ex)
        {
            // No request ever got this client: dispose and unregister at once (no grace).
            if (client is not null)
                DisposeClient(client, cluster);

            // Remove ONLY this instance; a newer good entry for the same key stays. No negative cache.
            _entries.TryRemove(new KeyValuePair<Key, Lazy<Task<Entry>>>(key, self()));

            if (ex is DataSourceUnavailableException)
                throw;
            _logger.LogWarning("[dsc] load-failed tenant={TenantId} secret={SecretId} error={ErrorType}",
                key.TenantId, key.SecretId, ex.GetType().Name);
            throw new DataSourceUnavailableException(ex.Message, ex);
        }
    }

    /// <summary>
    /// One sweeper run: retires entries 15 min or older (compare-and-remove) and disposes retired
    /// entries past their dispose time. Runs never overlap.
    /// </summary>
    internal async Task SweepAsync()
    {
        if (Interlocked.CompareExchange(ref _sweeping, 1, 0) != 0)
        {
            _logger.LogDebug("[dsc] sweeper tick skipped: the last run is still running");
            return;
        }

        try
        {
            var now = UtcNow;
            foreach (var pair in _entries)
            {
                var lazy = pair.Value;
                if (!lazy.IsValueCreated || !lazy.Value.IsCompletedSuccessfully)
                    continue;
                if (now - lazy.Value.Result.CreatedUtc < MaxAge)
                    continue;
                if (_entries.TryRemove(new KeyValuePair<Key, Lazy<Task<Entry>>>(pair.Key, lazy)))
                    EnqueueRetire(lazy);
            }

            var notDue = new List<Retired>();
            while (_retired.TryDequeue(out var retired))
            {
                if (retired.DisposeAt <= now)
                    await DisposeRetiredAsync(retired.Lazy).ConfigureAwait(false);
                else
                    notDue.Add(retired);
            }
            foreach (var retired in notDue)
                _retired.Enqueue(retired);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[dsc] sweeper run failed error={ErrorType}", ex.GetType().Name);
        }
        finally
        {
            Volatile.Write(ref _sweeping, 0);
        }
    }

    /// <summary>An unfinished load is awaited (bounded by its 30 s timeout); a faulted one has nothing to dispose.</summary>
    private async Task DisposeRetiredAsync(Lazy<Task<Entry>> lazy)
    {
        if (!lazy.IsValueCreated)
            return;

        Entry entry;
        try
        {
            entry = await lazy.Value.ConfigureAwait(false);
        }
        catch
        {
            return;
        }

        DisposeClient(entry.Client, entry.Cluster);
    }

    /// <summary><c>Client.Dispose()</c> then <c>UnregisterAndDisposeCluster</c>: only the second closes the pool and drops the credential.</summary>
    private void DisposeClient(IMongoClient client, ICluster? cluster)
    {
        try
        {
            client.Dispose();
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[dsc] client-dispose-failed error={ErrorType}", ex.GetType().Name);
        }

        if (cluster is null)
            return;
        try
        {
            _clusterRegistry.UnregisterAndDisposeCluster(cluster);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[dsc] cluster-unregister-failed error={ErrorType}", ex.GetType().Name);
        }
    }

    /// <summary>App stop: dispose every live and retired client (also unregisters their clusters).</summary>
    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        _sweepTimer?.Dispose();

        foreach (var pair in _entries)
        {
            if (_entries.TryRemove(new KeyValuePair<Key, Lazy<Task<Entry>>>(pair.Key, pair.Value)))
                _retired.Enqueue(new Retired(pair.Value, DateTime.MinValue));
        }

        while (_retired.TryDequeue(out var retired))
        {
            try
            {
                DisposeRetiredAsync(retired.Lazy).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[dsc] dispose-at-stop failed error={ErrorType}", ex.GetType().Name);
            }
        }
    }
}

/// <summary>Builds the driver client of one BYO data-source cache entry (data SPEC1 §3.5.4).</summary>
public interface IDataSourceClientFactory
{
    /// <summary>
    /// Builds a new client with its OWN cluster (unique <c>ApplicationName</c>). The cluster is read right
    /// after the build because <c>MongoClient.Cluster</c> throws after <c>Dispose()</c>.
    /// </summary>
    (IMongoClient Client, ICluster Cluster) Build(string connectionString);
}

public sealed class DataSourceClientFactory : IDataSourceClientFactory
{
    public const string ApplicationNamePrefix = "blocks-data-ds-";

    private readonly ActivitySource _activitySource;

    public DataSourceClientFactory(ActivitySource activitySource)
    {
        _activitySource = activitySource;
    }

    public (IMongoClient Client, ICluster Cluster) Build(string connectionString)
    {
        var client = new MongoClient(BuildSettings(connectionString, _activitySource));
        return (client, client.Cluster);
    }

    /// <summary>Genesis client settings (MongoDbContextProvider) + a unique ApplicationName per entry.</summary>
    public static MongoClientSettings BuildSettings(string connectionString, ActivitySource activitySource)
    {
        var settings = MongoClientSettings.FromConnectionString(connectionString);
        settings.RetryReads = true;
        settings.RetryWrites = true;
        settings.ServerSelectionTimeout = TimeSpan.FromSeconds(15);
        settings.ConnectTimeout = TimeSpan.FromSeconds(10);
        settings.ClusterConfigurator = cb => cb.Subscribe(new MongoEventSubscriber(activitySource));
        settings.ApplicationName = ApplicationNamePrefix + Guid.NewGuid().ToString("N");
        return settings;
    }
}

/// <summary>Wrapper around the driver's static <c>ClusterRegistry</c> (fake in unit tests).</summary>
public interface IClusterRegistry
{
    void UnregisterAndDisposeCluster(ICluster cluster);
}

public sealed class DriverClusterRegistry : IClusterRegistry
{
    public void UnregisterAndDisposeCluster(ICluster cluster) =>
        ClusterRegistry.Instance.UnregisterAndDisposeCluster(cluster);
}
