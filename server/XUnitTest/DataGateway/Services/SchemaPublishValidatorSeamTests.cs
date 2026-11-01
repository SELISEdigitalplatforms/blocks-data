using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schema;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// A publish asks <see cref="IPublishedSchemaValidator"/> whether the drafts build; whatever the
/// validator throws stops the publish before anything is stored.
/// </summary>
public class SchemaPublishValidatorSeamTests
{
    private const string Tenant = "tenant-1";

    [Fact]
    public async Task PublishAsync_ValidatorThrows_ThrowsSchemaPublishExceptionAndPublishesNothing()
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
            .Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(), It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync([drafts]);
        repository
            .Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(), It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync([]);
        repository
            .Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(), It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>()))
            .ReturnsAsync([]);

        var validator = new Mock<IPublishedSchemaValidator>();
        validator
            .Setup(v => v.Validate(Tenant, It.IsAny<SchemaSource>()))
            .Throws(new InvalidOperationException("boom"));
        var snapshotStore = new Mock<ISchemaSnapshotStore>();
        var versionStore = new Mock<ISchemaVersionStore>();

        var service = new SchemaPublishService(
            new SchemaAssembler(repository.Object), validator.Object, snapshotStore.Object, versionStore.Object,
            repository.Object, NullLogger<SchemaPublishService>.Instance);

        var act = () => service.PublishAsync(Tenant);

        var thrown = await act.Should().ThrowAsync<SchemaPublishException>();
        thrown.Which.Message.Should().Be("The schema could not be published because it does not build: boom");
        validator.Verify(v => v.Validate(Tenant, It.Is<SchemaSource>(s => s.SchemaDefinitions.Single().SchemaName == "Order")), Times.Once);
        snapshotStore.Verify(s => s.SaveAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSnapshotContent>(), It.IsAny<SchemaSnapshotKind>(), It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()), Times.Never);
        versionStore.Verify(v => v.AllocateAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
