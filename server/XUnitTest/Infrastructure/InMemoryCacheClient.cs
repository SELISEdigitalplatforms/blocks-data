using System.Collections.Concurrent;
using Blocks.Genesis;
using StackExchange.Redis;

namespace XUnitTest.Infrastructure;

/// <summary>
/// An in-memory stand-in for Redis covering the string and pub/sub calls. One instance can be
/// shared by several "pods" in a test, as replicas share one Redis. Each operation can be made to
/// fail, to exercise the paths where Redis is unavailable.
/// </summary>
public sealed class InMemoryCacheClient : ICacheClient
{
    private readonly ConcurrentDictionary<string, (string Value, long LifeSpanSeconds)> _strings = new();
    private readonly ConcurrentDictionary<string, List<Action<RedisChannel, RedisValue>>> _handlers = new();

    public bool FailReads { get; set; }
    public bool FailWrites { get; set; }
    public bool FailPublish { get; set; }
    public bool FailSubscribe { get; set; }
    public List<(string Channel, string Message)> Published { get; } = [];
    public int SubscribeAttempts { get; private set; }

    public string? Get(string key) => _strings.TryGetValue(key, out var entry) ? entry.Value : null;
    public long? LifeSpanOf(string key) => _strings.TryGetValue(key, out var entry) ? entry.LifeSpanSeconds : null;
    public void Set(string key, string value) => _strings[key] = (value, 0);
    public void Remove(string key) => _strings.TryRemove(key, out _);

    public Task<string> GetStringValueAsync(string key)
    {
        if (FailReads) throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, "redis down");
        return Task.FromResult(Get(key)!);
    }

    public Task<bool> AddStringValueAsync(string key, string value, long keyLifeSpan)
    {
        if (FailWrites) throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, "redis down");
        _strings[key] = (value, keyLifeSpan);
        return Task.FromResult(true);
    }

    public Task<bool> AddStringValueAsync(string key, string value) => AddStringValueAsync(key, value, 0);

    public Task<long> PublishAsync(string channel, string message)
    {
        if (FailPublish) throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, "redis down");
        lock (Published) Published.Add((channel, message));

        var handlers = _handlers.TryGetValue(channel, out var list) ? list.ToArray() : [];
        foreach (var handler in handlers)
        {
            handler(RedisChannel.Literal(channel), message);
        }
        return Task.FromResult((long)handlers.Length);
    }

    public Task SubscribeAsync(string channel, Action<RedisChannel, RedisValue> handler)
    {
        SubscribeAttempts++;
        if (FailSubscribe) throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, "redis down");
        _handlers.GetOrAdd(channel, _ => []).Add(handler);
        return Task.CompletedTask;
    }

    public Task UnsubscribeAsync(string channel)
    {
        _handlers.TryRemove(channel, out _);
        return Task.CompletedTask;
    }

    public bool IsSubscribed(string channel) => _handlers.ContainsKey(channel);

    // Not used by the code under test.
    public IDatabase CacheDatabase() => throw new NotSupportedException();
    public bool KeyExists(string key) => throw new NotSupportedException();
    public bool AddStringValue(string key, string value) => throw new NotSupportedException();
    public bool AddStringValue(string key, string value, long keyLifeSpan) => throw new NotSupportedException();
    public string GetStringValue(string key) => throw new NotSupportedException();
    public bool RemoveKey(string key) => throw new NotSupportedException();
    public bool AddHashValue(string key, IEnumerable<HashEntry> value) => throw new NotSupportedException();
    public bool AddHashValue(string key, IEnumerable<HashEntry> value, long keyLifeSpan) => throw new NotSupportedException();
    public HashEntry[] GetHashValue(string key) => throw new NotSupportedException();
    public Task<bool> KeyExistsAsync(string key) => throw new NotSupportedException();
    public Task<bool> RemoveKeyAsync(string key) => throw new NotSupportedException();
    public Task<bool> AddHashValueAsync(string key, IEnumerable<HashEntry> value) => throw new NotSupportedException();
    public Task<bool> AddHashValueAsync(string key, IEnumerable<HashEntry> value, long keyLifeSpan) => throw new NotSupportedException();
    public Task<HashEntry[]> GetHashValueAsync(string key) => throw new NotSupportedException();
}
