using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Notifications;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System.Text.Json;
using XUnitTest.Infrastructure;

namespace XUnitTest.Notifications;

/// <summary>Who hears about a schema change, and what the payload may carry.</summary>
[Collection("ContextSerial")]
public class SchemaChangeNotifierTests
{
    private readonly Mock<IBuiltInNotificationSender> _sender = new();
    private readonly List<BuiltInNotification> _sent = [];
    private readonly SchemaChangeNotifier _notifier;

    public SchemaChangeNotifierTests()
    {
        BlocksTestContext.Set(userId: "actor-1", organizationId: "org-9", tenantId: "tenant-1");
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>()))
            .Callback<BuiltInNotification>(_sent.Add).ReturnsAsync(true);
        _notifier = new SchemaChangeNotifier(_sender.Object, NullLogger<SchemaChangeNotifier>.Instance);
    }

    private static SchemaDefinition Schema(string? createdBy, string? lastUpdatedBy) => new()
    {
        ItemId = "schema-1", SchemaName = "Person", CreatedBy = createdBy, LastUpdatedBy = lastUpdatedBy
    };

    private static string Json(object payload) => JsonSerializer.Serialize(payload);

    [Fact]
    public async Task Changed_GoesToCreatorAndLastEditor_NotToTheActor()
    {
        await _notifier.NotifyChangedAsync(Schema("owner-1", "actor-1"), SchemaChangeType.SchemaUpdate);

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-schema-changed");
        n.TenantId.Should().Be("tenant-1");
        n.OrganizationId.Should().Be("org-9");
        n.UserIds.Should().Equal("owner-1");
        n.IncludeImpersonatedActor.Should().BeFalse("the actor made the change and must not get a notice about it");
    }

    [Fact]
    public async Task Changed_SendsBothPeopleWhenTheyDifferFromTheActor()
    {
        await _notifier.NotifyChangedAsync(Schema("owner-1", "editor-1"), SchemaChangeType.SchemaDelete);

        _sent.Single().UserIds.Should().BeEquivalentTo(["owner-1", "editor-1"]);
    }

    [Fact]
    public async Task Changed_PayloadHoldsNameAndKindOnly()
    {
        await _notifier.NotifyChangedAsync(Schema("owner-1", null), SchemaChangeType.SchemaFieldUpdate);

        using var doc = JsonDocument.Parse(Json(_sent.Single().Payload));
        doc.RootElement.GetProperty("schemaName").GetString().Should().Be("Person");
        doc.RootElement.GetProperty("changeKind").GetString().Should().Be("fields-saved");
        doc.RootElement.TryGetProperty("actorId", out _).Should().BeFalse();
    }

    [Theory]
    [InlineData("actor-1", "actor-1")]
    [InlineData(null, null)]
    [InlineData("system", "system")]
    [InlineData("", "actor-1")]
    public async Task Changed_NobodyElseToTell_SendsNothing(string? createdBy, string? lastUpdatedBy)
    {
        await _notifier.NotifyChangedAsync(Schema(createdBy, lastUpdatedBy), SchemaChangeType.SchemaCreate);

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task Changed_APrepareFailureNeverReachesTheSchemaOperation()
    {
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>())).ThrowsAsync(new InvalidOperationException("boom"));

        var act = () => _notifier.NotifyChangedAsync(Schema("owner-1", null), SchemaChangeType.SchemaCreate);

        await act.Should().NotThrowAsync();
    }

    [Theory]
    [InlineData(SchemaChangeType.SchemaCreate, "created")]
    [InlineData(SchemaChangeType.SchemaUpdate, "updated")]
    [InlineData(SchemaChangeType.SchemaDelete, "deleted")]
    [InlineData(SchemaChangeType.SchemaFieldUpdate, "fields-saved")]
    [InlineData(SchemaChangeType.SchemaIndexCreate, "index-created")]
    [InlineData(SchemaChangeType.SchemaIndexDelete, "index-deleted")]
    public void KindName_IsTheContractTheConsoleReads(SchemaChangeType kind, string expected) =>
        SchemaChangeNotifier.KindName(kind).Should().Be(expected);
}
