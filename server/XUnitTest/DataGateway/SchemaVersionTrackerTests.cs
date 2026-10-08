using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate.Execution;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace XUnitTest.DataGateway;

public class SchemaVersionTrackerTests
{
    private sealed class ManualTime : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
        public void Advance(TimeSpan by) => Now += by;
    }

    private readonly Mock<ISchemaVersionStore> _store = new();
    private readonly Mock<IRequestExecutorResolver> _resolver = new();
    private readonly BuiltSchemaVersions _built = new();
    private readonly ManualTime _time = new();
    private static readonly TimeSpan Poll = TimeSpan.FromSeconds(5);

    private SchemaVersionTracker Tracker() => new(
        _store.Object, _built, () => _resolver.Object, _time, Poll, NullLogger<SchemaVersionTracker>.Instance);

    /// <summary>MongoDB and its Redis copy agree on the published version.</summary>
    private void PublishedVersionIs(long version)
    {
        _store.Setup(s => s.GetAsync("tenant-1", It.IsAny<CancellationToken>())).ReturnsAsync(version);
        _store.Setup(s => s.GetCachedAsync("tenant-1", It.IsAny<CancellationToken>())).ReturnsAsync(version);
    }

    private void CachedVersionIs(long version) =>
        _store.Setup(s => s.GetCachedAsync("tenant-1", It.IsAny<CancellationToken>())).ReturnsAsync(version);

    private void BuiltAt(long version)
    {
        _built.BeginBuild("tenant-1", version);
        _built.CompleteBuild("tenant-1");
    }

    [Fact]
    public async Task EnsureCurrent_RebuildsWhenThisPodIsBehind()
    {
        BuiltAt(6);
        PublishedVersionIs(7);

        await Tracker().EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task EnsureCurrent_LeavesAnUpToDateExecutorAlone()
    {
        BuiltAt(7);
        PublishedVersionIs(7);

        await Tracker().EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task EnsureCurrent_SkipsATenantThisPodHasNotBuilt()
    {
        PublishedVersionIs(7);

        await Tracker().EnsureCurrentAsync("tenant-1");

        // It will be built on demand at the latest version; nothing to check or evict.
        _store.Verify(s => s.GetCachedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(s => s.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task EnsureCurrent_ChecksTheStoreAtMostOncePerPollInterval()
    {
        BuiltAt(7);
        PublishedVersionIs(7);
        var tracker = Tracker();

        await tracker.EnsureCurrentAsync("tenant-1");
        _time.Advance(TimeSpan.FromSeconds(4));
        await tracker.EnsureCurrentAsync("tenant-1");
        await tracker.EnsureCurrentAsync("tenant-1");

        _store.Verify(s => s.GetCachedAsync("tenant-1", It.IsAny<CancellationToken>()), Times.Once);

        _time.Advance(TimeSpan.FromSeconds(1));
        await tracker.EnsureCurrentAsync("tenant-1");

        _store.Verify(s => s.GetCachedAsync("tenant-1", It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task EnsureCurrent_DoesNotReadMongoWhileTheRedisCopyMatches()
    {
        BuiltAt(7);
        PublishedVersionIs(7);

        await Tracker().EnsureCurrentAsync("tenant-1");

        _store.Verify(s => s.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task EnsureCurrent_ConfirmsAChangeWithMongoBeforeRebuilding()
    {
        BuiltAt(7);
        PublishedVersionIs(7);
        CachedVersionIs(9); // a wrong copy, e.g. written by a race or left over

        await Tracker().EnsureCurrentAsync("tenant-1");

        _store.Verify(s => s.GetAsync("tenant-1", It.IsAny<CancellationToken>()), Times.Once);
        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task EnsureCurrent_DoesNotRequestTheSameRebuildAgainBeforeTheBackoff()
    {
        BuiltAt(6);
        PublishedVersionIs(7);
        var tracker = Tracker();

        // The rebuild fails, so the pod stays at version 6 across later checks.
        await tracker.EnsureCurrentAsync("tenant-1");
        _time.Advance(Poll);
        await tracker.EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);

        _time.Advance(SchemaVersionTracker.RetryBackoff);
        await tracker.EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Exactly(2));
    }

    [Fact]
    public async Task EnsureCurrent_RequestsANewerVersionWithoutWaitingForTheBackoff()
    {
        BuiltAt(6);
        PublishedVersionIs(7);
        var tracker = Tracker();
        await tracker.EnsureCurrentAsync("tenant-1");

        PublishedVersionIs(8);
        _time.Advance(Poll);
        await tracker.EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Exactly(2));
    }

    [Fact]
    public async Task EnsureCurrent_NeverFailsTheRequestWhenTheStoreIsUnavailable()
    {
        BuiltAt(6);
        _store.Setup(s => s.GetCachedAsync("tenant-1", It.IsAny<CancellationToken>()))
              .ThrowsAsync(new TimeoutException("mongo down"));

        var act = async () => await Tracker().EnsureCurrentAsync("tenant-1");

        await act.Should().NotThrowAsync();
        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    // ---------------- publish messages ----------------

    [Fact]
    public async Task OnVersionPublished_RebuildsOnceMongoConfirmsTheNewVersion()
    {
        BuiltAt(6);
        PublishedVersionIs(7);

        await Tracker().OnVersionPublishedAsync("tenant-1", 7);

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task OnVersionPublished_IgnoresAVersionThisPodAlreadyServes()
    {
        BuiltAt(7);

        await Tracker().OnVersionPublishedAsync("tenant-1", 7);

        _store.Verify(s => s.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task OnVersionPublished_ALateMessageForAnOlderVersionCostsOnlyACheck()
    {
        BuiltAt(7);
        PublishedVersionIs(7);

        await Tracker().OnVersionPublishedAsync("tenant-1", 5);

        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task OnVersionPublished_IgnoresATenantThisPodHasNotBuilt()
    {
        await Tracker().OnVersionPublishedAsync("tenant-1", 7);

        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task OnVersionPublished_DoesNotRebuildForAMessageMongoDoesNotConfirm()
    {
        BuiltAt(6);
        PublishedVersionIs(6);

        await Tracker().OnVersionPublishedAsync("tenant-1", 9);

        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task OnVersionPublished_DoesNotRepeatARebuildThisPodAlreadyStarted()
    {
        BuiltAt(6);
        PublishedVersionIs(7);
        var tracker = Tracker();

        // The publishing pod starts its own rebuild, then hears its own announcement.
        await tracker.RebuildNowAsync("tenant-1", 7, TimeSpan.FromMilliseconds(20));
        await tracker.OnVersionPublishedAsync("tenant-1", 7);

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task RebuildNow_OnlyWaitsWhenTheAnnouncementAlreadyStartedTheRebuild()
    {
        BuiltAt(6);
        PublishedVersionIs(7);
        EvictionRebuildsAt(7);
        var tracker = Tracker();

        // The publishing pod hears its own announcement before it starts its own rebuild.
        await tracker.OnVersionPublishedAsync("tenant-1", 7);
        var rebuilt = await tracker.RebuildNowAsync("tenant-1", 7, TimeSpan.FromSeconds(5));

        rebuilt.Should().BeTrue();
        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task OnVersionPublished_FollowsARollbackToAnOlderVersion()
    {
        BuiltAt(12);
        PublishedVersionIs(10);

        await Tracker().OnVersionPublishedAsync("tenant-1", 10);

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task EnsureCurrent_FollowsARollbackToAnOlderVersion()
    {
        BuiltAt(12);
        PublishedVersionIs(10);

        await Tracker().EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task RebuildNow_ForARollbackWaitsForExactlyThatVersion()
    {
        BuiltAt(12);
        EvictionRebuildsAt(10);

        var rebuilt = await Tracker().RebuildNowAsync("tenant-1", 10, TimeSpan.FromSeconds(5), exactVersion: true);

        rebuilt.Should().BeTrue();
        _built.TryGetBuilt("tenant-1", out var version).Should().BeTrue();
        version.Should().Be(10);
    }

    [Fact]
    public async Task BuiltVersions_ExactWaitIsNotSatisfiedByANewerVersion()
    {
        BuiltAt(12);

        (await _built.WaitForBuildAsync("tenant-1", 10, TimeSpan.FromMilliseconds(50), exactVersion: true)).Should().BeFalse();
        (await _built.WaitForBuildAsync("tenant-1", 10, TimeSpan.FromMilliseconds(50))).Should().BeTrue();
    }

    [Fact]
    public async Task OnVersionPublished_SwallowsStoreFailures()
    {
        BuiltAt(6);
        _store.Setup(s => s.GetAsync("tenant-1", It.IsAny<CancellationToken>()))
              .ThrowsAsync(new TimeoutException("mongo down"));

        var act = () => Tracker().OnVersionPublishedAsync("tenant-1", 7);

        await act.Should().NotThrowAsync();
    }

    /// <summary>Makes the mocked eviction behave like HotChocolate: the executor is rebuilt at <paramref name="version"/>.</summary>
    private void EvictionRebuildsAt(long version) =>
        _resolver.Setup(r => r.EvictRequestExecutor("tenant-1")).Callback(() => Task.Run(async () =>
        {
            await Task.Delay(50);
            _built.BeginBuild("tenant-1", version);
            _built.CompleteBuild("tenant-1");
        }));

    [Fact]
    public async Task RebuildNow_EvictsAndWaitsForTheNewExecutor()
    {
        BuiltAt(6);
        EvictionRebuildsAt(7);

        var rebuilt = await Tracker().RebuildNowAsync("tenant-1", 7, TimeSpan.FromSeconds(5));

        rebuilt.Should().BeTrue();
        _built.TryGetBuilt("tenant-1", out var version).Should().BeTrue();
        version.Should().Be(7, "the publish returns only once this pod serves the new version");
        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task RebuildNow_ReportsARebuildThatDidNotFinishInTime()
    {
        BuiltAt(6);

        var rebuilt = await Tracker().RebuildNowAsync("tenant-1", 7, TimeSpan.FromMilliseconds(100));

        rebuilt.Should().BeFalse();
    }

    [Fact]
    public async Task RebuildNow_SkipsATenantThisPodHasNotBuilt()
    {
        var rebuilt = await Tracker().RebuildNowAsync("tenant-1", 7, TimeSpan.FromSeconds(5));

        rebuilt.Should().BeTrue("the first request builds it at the latest version");
        _resolver.Verify(r => r.EvictRequestExecutor(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task RebuildNow_CountsAsTheRequestSoTheNextCheckDoesNotRepeatIt()
    {
        BuiltAt(6);
        PublishedVersionIs(7);
        var tracker = Tracker();

        await tracker.RebuildNowAsync("tenant-1", 7, TimeSpan.FromMilliseconds(50));
        _time.Advance(Poll);
        await tracker.EnsureCurrentAsync("tenant-1");

        _resolver.Verify(r => r.EvictRequestExecutor("tenant-1"), Times.Once);
    }

    [Fact]
    public async Task BuiltVersions_WaitReturnsAtOnceWhenTheVersionIsAlreadyServed()
    {
        BuiltAt(8);

        (await _built.WaitForBuildAsync("tenant-1", 7, TimeSpan.FromMilliseconds(10))).Should().BeTrue();
    }

    [Fact]
    public async Task BuiltVersions_WaitKeepsWaitingPastABuildOfAnOlderVersion()
    {
        BuiltAt(5);
        var waiting = _built.WaitForBuildAsync("tenant-1", 7, TimeSpan.FromSeconds(5));

        BuiltAt(6);
        await Task.Delay(50);
        waiting.IsCompleted.Should().BeFalse();

        BuiltAt(7);
        (await waiting).Should().BeTrue();
    }

    [Fact]
    public void BuiltVersions_OnlyCountABuildOnceTheExecutorWasCreated()
    {
        var built = new BuiltSchemaVersions();

        built.BeginBuild("tenant-1", 3);
        built.TryGetBuilt("tenant-1", out _).Should().BeFalse("a build that has not finished may still fail");

        built.CompleteBuild("tenant-1");
        built.TryGetBuilt("tenant-1", out var version).Should().BeTrue();
        version.Should().Be(3);
    }

    [Fact]
    public void BuiltVersions_IgnoreACompletionWithoutABuild()
    {
        var built = new BuiltSchemaVersions();

        built.CompleteBuild("tenant-1");

        built.TryGetBuilt("tenant-1", out _).Should().BeFalse();
    }
}
