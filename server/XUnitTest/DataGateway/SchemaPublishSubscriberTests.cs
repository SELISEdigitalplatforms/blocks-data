using System.Text.Json;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate.Execution;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway;

public class SchemaPublishSubscriberTests
{
    private readonly InMemoryCacheClient _cache = new();
    private readonly Mock<ISchemaVersionStore> _store = new();
    private readonly Mock<IRequestExecutorResolver> _resolver = new();
    private readonly BuiltSchemaVersions _built = new();

    private SchemaPublishSubscriber Subscriber(TimeSpan? retryDelay = null)
    {
        var tracker = new SchemaVersionTracker(
            _store.Object, _built, () => _resolver.Object, TimeProvider.System,
            SchemaVersionTracker.DefaultPollInterval, NullLogger<SchemaVersionTracker>.Instance);
        return new SchemaPublishSubscriber(_cache, tracker, NullLogger<SchemaPublishSubscriber>.Instance,
            retryDelay ?? TimeSpan.FromMilliseconds(20));
    }

    private static async Task EventuallyAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!condition() && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20);
        }
        condition().Should().BeTrue();
    }

    private void TenantBuiltAt(long version)
    {
        _built.BeginBuild("tenant-1", version);
        _built.CompleteBuild("tenant-1");
    }

    [Fact]
    public async Task ASubscribedPodRebuildsWhenAPublishIsAnnounced()
    {
        TenantBuiltAt(6);
        _store.Setup(s => s.GetAsync("tenant-1", It.IsAny<CancellationToken>())).ReturnsAsync(7);
        var evicted = false;
        _resolver.Setup(r => r.EvictRequestExecutor("tenant-1")).Callback(() => evicted = true);
        var subscriber = Subscriber();

        await subscriber.StartAsync(CancellationToken.None);
        await EventuallyAsync(() => _cache.IsSubscribed(SchemaVersionStore.ChannelName));
        await _cache.PublishAsync(SchemaVersionStore.ChannelName,
            JsonSerializer.Serialize(new SchemaVersionPublished("tenant-1", 7)));

        await EventuallyAsync(() => evicted);
        await subscriber.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task KeepsRetryingTheSubscriptionWhileRedisIsDown()
    {
        _cache.FailSubscribe = true;
        var subscriber = Subscriber(TimeSpan.FromMilliseconds(20));

        // Starting must not fail the host.
        await subscriber.StartAsync(CancellationToken.None);
        await EventuallyAsync(() => _cache.SubscribeAttempts >= 2);

        _cache.FailSubscribe = false;
        await EventuallyAsync(() => _cache.IsSubscribed(SchemaVersionStore.ChannelName));
        await subscriber.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task UnsubscribesOnStop()
    {
        var subscriber = Subscriber();
        await subscriber.StartAsync(CancellationToken.None);
        await EventuallyAsync(() => _cache.IsSubscribed(SchemaVersionStore.ChannelName));

        await subscriber.StopAsync(CancellationToken.None);

        _cache.IsSubscribed(SchemaVersionStore.ChannelName).Should().BeFalse();
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{\"TenantId\":\"\",\"Version\":3}")]
    [InlineData("null")]
    public void IgnoresMalformedMessages(string message)
    {
        TenantBuiltAt(6);

        var act = () => Subscriber().OnMessage(StackExchange.Redis.RedisChannel.Literal(SchemaVersionStore.ChannelName), message);

        act.Should().NotThrow();
        _store.Verify(s => s.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
