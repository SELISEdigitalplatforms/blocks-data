using FluentAssertions;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Worker.Consumers;

namespace XUnitTest.Worker;

public class MigrationCompletionEventConsumerTests
{
    private readonly Mock<IProjectService> _projectService = new();
    private readonly Mock<IDbRepository> _dbRepository = new();
    private readonly MigrationCompletionEventConsumer _consumer;

    public MigrationCompletionEventConsumerTests()
    {
        _consumer = new MigrationCompletionEventConsumer(
            NullLogger<MigrationCompletionEventConsumer>.Instance,
            _projectService.Object,
            _dbRepository.Object);
    }

    private static MigrationCompletionEvent Event() => new()
    {
        TrackerId = "tracker-1",
        ServiceName = "blocks-data",
        IsSuccess = true,
    };

    private static BsonDocument Tracker(string from = "old-key", string to = "new-key") => new()
    {
        { "_id", "tracker-1" },
        { "ProjectKey", from },
        { "TargetedProjectKey", to },
    };

    private void GivenTracker(BsonDocument? tracker) =>
        _dbRepository
            .Setup(r => r.GetItemAsync("MigrationTrackers", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync(tracker);

    private void GivenUpdates(bool schemasAcknowledged, bool configurationsAcknowledged)
    {
        _dbRepository
            .Setup(r => r.UpdateManyAsync("SchemaDefinitions", It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = schemasAcknowledged, TotalImpactedData = 3 });
        _dbRepository
            .Setup(r => r.UpdateManyAsync("DataServiceConfigurations", It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = configurationsAcknowledged, TotalImpactedData = 2 });
    }

    [Fact]
    public async Task Consume_RepointsSchemasAndConfigurationsAtTheTargetProject()
    {
        GivenTracker(Tracker());
        GivenUpdates(true, true);
        _projectService.Setup(p => p.GetTenantSlugAsync("new-key")).ReturnsAsync("new-slug");

        await _consumer.Consume(Event());

        _dbRepository.Verify(r => r.UpdateManyAsync(
            "SchemaDefinitions",
            It.Is<BsonDocument>(f => f["ProjectKey"] == "old-key"),
            It.Is<BsonDocument>(d => d["ProjectKey"] == "new-key" && d["ProjectShortKey"] == "new-slug"),
            "new-key"), Times.Once);

        _dbRepository.Verify(r => r.UpdateManyAsync(
            "DataServiceConfigurations",
            It.Is<BsonDocument>(f => f["ProjectKey"] == "old-key"),
            It.Is<BsonDocument>(d => d["ProjectKey"] == "new-key" && d["ProjectShortKey"] == "new-slug"),
            "new-key"), Times.Once);
    }

    [Fact]
    public async Task Consume_StopsWhenTheTrackerIsMissing()
    {
        GivenTracker(null);

        await _consumer.Consume(Event());

        _dbRepository.Verify(r => r.UpdateManyAsync(
            It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Consume_DoesNotTouchConfigurationsWhenTheSchemaUpdateIsNotAcknowledged()
    {
        GivenTracker(Tracker());
        GivenUpdates(schemasAcknowledged: false, configurationsAcknowledged: true);
        _projectService.Setup(p => p.GetTenantSlugAsync(It.IsAny<string>())).ReturnsAsync("new-slug");

        await _consumer.Consume(Event());

        _dbRepository.Verify(r => r.UpdateManyAsync(
            "DataServiceConfigurations", It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Consume_SwallowsAnUnacknowledgedConfigurationUpdate()
    {
        GivenTracker(Tracker());
        GivenUpdates(schemasAcknowledged: true, configurationsAcknowledged: false);
        _projectService.Setup(p => p.GetTenantSlugAsync(It.IsAny<string>())).ReturnsAsync("new-slug");

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task Consume_SwallowsAMalformedTracker()
    {
        // No ProjectKey field, so GetValue throws inside the consumer.
        GivenTracker(new BsonDocument { { "_id", "tracker-1" } });

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
        _dbRepository.Verify(r => r.UpdateManyAsync(
            It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Consume_SwallowsRepositoryFailures()
    {
        _dbRepository
            .Setup(r => r.GetItemAsync("MigrationTrackers", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ThrowsAsync(new TimeoutException("mongo down"));

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }
}
