using Blocks.Genesis;
using Blocks.Genesis.Entities.Os;
using DataGateway.DomainService.Notifications;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System.Text.Json;
using XUnitTest.Infrastructure;

namespace XUnitTest.Notifications;

/// <summary>When <c>data-record-changed</c> goes out, and what it may carry (never record values).</summary>
[Collection("ContextSerial")]
public class MutationNotifierTests : IDisposable
{
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 28, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }

    private readonly Mock<IBuiltInNotificationSender> _sender = new();
    private readonly Mock<IKeyValueStore> _store = new();
    private readonly TestClock _time = new();
    private readonly List<BuiltInNotification> _sent = [];
    private readonly MutationNotifier _notifier;

    public MutationNotifierTests()
    {
        BlocksTestContext.Set(userId: "actor-1", organizationId: "org-9", tenantId: "tenant-1");
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>())).Callback<BuiltInNotification>(_sent.Add).ReturnsAsync(true);
        Config(Watched());
        _notifier = new MutationNotifier(_sender.Object, _store.Object, NullLogger<MutationNotifier>.Instance, _time);
    }

    public void Dispose() => BlocksTestContext.Clear();

    private void Config(NotificationConfiguration? config) =>
        _store.Setup(s => s.GetAsync<NotificationConfiguration>("notification-config:data-record-changed", It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(config);

    private static NotificationConfiguration Watched(NotificationAudienceLevel level = NotificationAudienceLevel.AllUsers) => new()
    {
        Name = "data-record-changed",
        Audience = new NotificationAudience { Level = level, Roles = level == NotificationAudienceLevel.Selected ? ["Admin"] : [] }
    };

    [Fact]
    public async Task Single_Insert_SendsSchemaOperationIdAndActor_NoValues()
    {
        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "rec-1", 1);

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-record-changed");
        n.UserIds.Should().BeEmpty("the tenant's config decides who receives it");
        n.OrganizationId.Should().Be("org-9");
        n.IncludeImpersonatedActor.Should().BeFalse();
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(n.Payload));
        doc.RootElement.GetProperty("schemaName").GetString().Should().Be("Person");
        doc.RootElement.GetProperty("operation").GetString().Should().Be("insert");
        doc.RootElement.GetProperty("recordId").GetString().Should().Be("rec-1");
        doc.RootElement.GetProperty("count").GetInt64().Should().Be(1);
        doc.RootElement.GetProperty("actorId").GetString().Should().Be("actor-1");
    }

    [Fact]
    public async Task Bulk_SendsTheCountWithoutARecordId()
    {
        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Delete, null, 250);

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(_sent.Single().Payload));
        doc.RootElement.GetProperty("count").GetInt64().Should().Be(250);
        doc.RootElement.GetProperty("operation").GetString().Should().Be("delete");
        doc.RootElement.GetProperty("recordId").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task NoConfig_SendsNothing()
    {
        Config(null);

        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Update, "rec-1", 1);

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task DisabledConfig_SendsNothing()
    {
        var config = Watched();
        config.IsDisabled = true;
        Config(config);

        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Update, "rec-1", 1);

        _sent.Should().BeEmpty();
    }

    [Theory]
    [InlineData(NotificationAudienceLevel.AffectedOnly, false)]
    [InlineData(NotificationAudienceLevel.AllUsers, true)]
    [InlineData(NotificationAudienceLevel.Selected, true)]
    public void IsWatched_OnlyForAllUsers_OrSelectedWithRules(NotificationAudienceLevel level, bool expected) =>
        MutationNotifier.IsWatched(Watched(level)).Should().Be(expected);

    [Fact]
    public void IsWatched_SelectedWithoutRules_IsNotWatched()
    {
        var config = Watched(NotificationAudienceLevel.Selected);
        config.Audience!.Roles.Clear();

        MutationNotifier.IsWatched(config).Should().BeFalse();
    }

    [Fact]
    public async Task TheConfigIsReadOncePerMinutePerTenant_ThenAgain()
    {
        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "a", 1);
        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "b", 1);
        _store.Verify(s => s.GetAsync<NotificationConfiguration>(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Once);

        _time.Advance(MutationNotifier.CacheTime + TimeSpan.FromSeconds(1));
        await _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "c", 1);

        _store.Verify(s => s.GetAsync<NotificationConfiguration>(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task AFailedConfigRead_MeansOff_AndNeverReachesTheWrite()
    {
        _store.Setup(s => s.GetAsync<NotificationConfiguration>(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("db down"));

        var act = () => _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "a", 1);

        await act.Should().NotThrowAsync();
        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task ASenderFailure_NeverReachesTheWrite()
    {
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>())).ThrowsAsync(new InvalidOperationException("boom"));

        var act = () => _notifier.NotifyRecordsChangedAsync("Person", RecordChangeKind.Insert, "a", 1);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task BulkResult_GoesToTheCaller_WithCountOnly()
    {
        await _notifier.NotifyBulkResultAsync("Person", "delete", true, 12);

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-bulk-change-progress");
        n.UserIds.Should().Equal("actor-1");
        n.OrganizationId.Should().Be("org-9");
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(n.Payload));
        doc.RootElement.GetProperty("affectedCount").GetInt64().Should().Be(12);
        doc.RootElement.GetProperty("isSuccess").GetBoolean().Should().BeTrue();
    }
}
