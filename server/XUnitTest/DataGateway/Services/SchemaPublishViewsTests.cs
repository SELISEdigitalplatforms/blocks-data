using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// A publish writes the per-entity views of the version it stores, before the version is made
/// live, and never fails because of them.
/// </summary>
public class SchemaPublishViewsTests
{
    private const string Tenant = "tenant-1";

    private readonly Mock<IEntityViewStore> _views = new();
    private readonly Mock<ISchemaSnapshotStore> _snapshots = new();
    private readonly Mock<ISchemaVersionStore> _versions = new();
    private readonly List<string> _calls = [];
    private readonly SchemaPublishService _service;

    public SchemaPublishViewsTests()
    {
        BlocksTestContext.Set();
        var repository = new Mock<IDbRepository>();
        repository
            .Setup(r => r.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(It.IsAny<FilterDefinition<SchemaChangeLog>>(), It.IsAny<SortDefinition<SchemaChangeLog>?>(), It.IsAny<string>()))
            .ReturnsAsync([]);
        var drafts = new SchemaDefinition
        {
            ItemId = "sch-order",
            SchemaName = "Order",
            CollectionName = "Orders",
            SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Name", Type = "String" }],
        };
        repository
            .Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>?>(), It.IsAny<ProjectionDefinition<BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync(() => [drafts]);
        repository
            .Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>?>(), It.IsAny<ProjectionDefinition<BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync([]);
        repository
            .Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>?>(), It.IsAny<ProjectionDefinition<BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync([]);

        _versions.Setup(v => v.AllocateAsync(Tenant, It.IsAny<CancellationToken>())).ReturnsAsync(7);
        _versions
            .Setup(v => v.MakeCurrentAsync(Tenant, 7, It.IsAny<CancellationToken>()))
            .Callback(() => _calls.Add("MakeCurrent"))
            .ReturnsAsync(7);
        _snapshots
            .Setup(s => s.SaveAsync(Tenant, 7, It.IsAny<SchemaSnapshotContent>(), It.IsAny<SchemaSnapshotKind>(), It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .Callback(() => _calls.Add("Save"))
            .ReturnsAsync(new PublishedSchemaSnapshot { ChunkCount = 1 });
        _snapshots
            .Setup(s => s.ListAsync(Tenant, 0, It.IsAny<CancellationToken>()))
            .ReturnsAsync([new PublishedSchemaSnapshot { Version = 7 }, new PublishedSchemaSnapshot { Version = 6 }]);
        _views
            .Setup(v => v.WriteAsync(Tenant, 7, It.IsAny<SchemaSource>()))
            .Callback(() => _calls.Add("WriteViews"))
            .Returns(Task.CompletedTask);

        _service = new SchemaPublishService(
            new SchemaAssembler(repository.Object), Mock.Of<IPublishedSchemaValidator>(), _snapshots.Object, _versions.Object,
            repository.Object, _views.Object, NullLogger<SchemaPublishService>.Instance);
    }

    [Fact]
    public async Task Publish_WritesViewsBeforeMakingVersionCurrent()
    {
        await _service.PublishAsync(Tenant);

        _calls.Should().Equal("Save", "WriteViews", "MakeCurrent");
        _views.Verify(v => v.WriteAsync(Tenant, 7, It.Is<SchemaSource>(s => s.SchemaDefinitions.Single().SchemaName == "Order")), Times.Once);
    }

    [Fact]
    public async Task Publish_ViewWriteFails_StillPublishes()
    {
        _views.Setup(v => v.WriteAsync(Tenant, 7, It.IsAny<SchemaSource>())).ThrowsAsync(new InvalidOperationException("views down"));

        var result = await _service.PublishAsync(Tenant);

        result.Version.Should().Be(7);
        _versions.Verify(v => v.MakeCurrentAsync(Tenant, 7, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Bootstrap_WritesViewsBeforeMakingVersionCurrent_AndSurvivesAViewFailure()
    {
        await _service.BootstrapAsync(Tenant);
        _calls.Should().Equal("Save", "WriteViews", "MakeCurrent");

        _views.Setup(v => v.WriteAsync(Tenant, 7, It.IsAny<SchemaSource>())).ThrowsAsync(new InvalidOperationException("views down"));
        var act = () => _service.BootstrapAsync(Tenant);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task Publish_PrunesViewsToTheVersionsStillListed()
    {
        await _service.PublishAsync(Tenant);

        _views.Verify(v => v.DeleteExceptAsync(Tenant, It.Is<IReadOnlyCollection<long>>(kept => kept.OrderBy(x => x).SequenceEqual(new long[] { 6, 7 }))), Times.Once);
    }

    [Fact]
    public async Task Publish_ViewPruneFails_StillPublishes()
    {
        _views.Setup(v => v.DeleteExceptAsync(Tenant, It.IsAny<IReadOnlyCollection<long>>())).ThrowsAsync(new InvalidOperationException("views down"));

        var act = () => _service.PublishAsync(Tenant);

        await act.Should().NotThrowAsync();
    }
}
