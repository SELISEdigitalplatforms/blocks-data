using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

[Collection("ContextSerial")]
public class GatewayMutationServiceTests
{
    private readonly Mock<IGqlDbRepository> _repo = new();
    private readonly Mock<IDataChangeEventPublisher> _publisher = new();
    private readonly GatewayMutationService _service;

    public GatewayMutationServiceTests()
    {
        _service = new GatewayMutationService(_repo.Object, _publisher.Object, Mock.Of<ILogger<GatewayMutationService>>());

        _repo.Setup(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync((string _, BsonDocument d) => d);
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()))
            .ReturnsAsync((string _, List<BsonDocument> d) => new BulkActionResponse { Acknowledged = true, TotalImpactedData = d.Count });
        _repo.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 1 });
        _repo.Setup(r => r.UpdateManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 2 });
        _repo.Setup(r => r.DeleteAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 1 });
        _repo.Setup(r => r.DeleteManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 2 });
        // default: no uniqueness conflicts
        _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument>());
    }

    private static SchemaDefinitionExtended SimpleSchema() =>
        Schema(fields: new() { Field("Name"), Field("Age", "Int") });

    [Fact]
    public async Task InsertAsync_HappyPath_InsertsAndPublishes()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(userId: "u-1");
        try
        {
            var input = new Dictionary<string, object?> { ["Name"] = "John", ["Age"] = 30 };
            var result = await _service.InsertAsync(SimpleSchema(), input);

            result.Acknowledged.Should().BeTrue();
            result.ItemId.Should().NotBeNullOrEmpty();
            _repo.Verify(r => r.InsertAsync(It.IsAny<string>(),
                It.Is<BsonDocument>(d => d.Contains("_id") && d.Contains("Name"))), Times.Once);
            _publisher.Verify(p => p.PublishAsync(It.IsAny<SchemaDefinitionExtended>(),
                DataChangeOperation.Inserted, It.IsAny<List<BsonDocument>>(), null), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task InsertAsync_CustomWriteAccess_NoRlsPolicies_ThrowsAccessDenied()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(write: SchemaAccessLevel.Custom, fields: new() { Field("Name") });
            var act = () => _service.InsertAsync(schema, new Dictionary<string, object?> { ["Name"] = "x" });
            await act.Should().ThrowAsync<AccessDeniedException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task InsertAsync_ValidationFailure_ThrowsDataValidationException()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var nameField = Field("Name");
            nameField.ValidationRule = new DataValidation
            {
                Validations = new List<ValidationRule> { new() { Type = ValidationType.NotEmpty, IsActive = true } }
            };
            var schema = Schema(fields: new() { nameField });
            var act = () => _service.InsertAsync(schema, new Dictionary<string, object?> { ["Name"] = "" });
            await act.Should().ThrowAsync<DataValidationException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task InsertAsync_UniqueField_Conflict_Throws()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(userId: "u-1");
        try
        {
            var schema = Schema(fields: new() { Field("Email", isUnique: true) });
            // repository returns an existing record with the same Email => conflict
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument> { new BsonDocument("Email", "dup@x.com") });

            var act = () => _service.InsertAsync(schema, new Dictionary<string, object?> { ["Email"] = "dup@x.com" });
            await act.Should().ThrowAsync<DataValidationException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task UpdateAsync_Found_UpdatesAndPublishes()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(userId: "u-1");
        try
        {
            _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
                .ReturnsAsync(new BsonDocument { { "_id", "id-1" }, { "Name", "Old" } });

            var result = await _service.UpdateAsync(SimpleSchema(), "id-1",
                new Dictionary<string, object?> { ["Name"] = "New" });

            result.Acknowledged.Should().BeTrue();
            result.ItemId.Should().Be("id-1");
            _repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Once);
            _publisher.Verify(p => p.PublishAsync(It.IsAny<SchemaDefinitionExtended>(),
                DataChangeOperation.Updated, null, It.IsAny<List<UpdatedDocument>>()), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task UpdateAsync_NotFound_ReturnsNotFoundResponse()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
                .ReturnsAsync((BsonDocument?)null);

            var result = await _service.UpdateAsync(SimpleSchema(), "missing",
                new Dictionary<string, object?> { ["Name"] = "New" });

            result.Acknowledged.Should().BeFalse();
            result.Message.Should().Contain("UPDATE");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task DeleteAsync_SoftDelete_ArchivesAndPublishes()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument> { new BsonDocument { { "_id", "id-1" }, { "Name", "John" } } });

            var result = await _service.DeleteAsync(SimpleSchema(), "id-1", hardDelete: false);

            result.Acknowledged.Should().BeTrue();
            result.ItemId.Should().Be("id-1");
            // archive record inserted
            _repo.Verify(r => r.InsertAsync(It.Is<string>(s => s.Contains("DataMutationRecord")), It.IsAny<BsonDocument>()), Times.Once);
            _repo.Verify(r => r.DeleteAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Once);
            _publisher.Verify(p => p.PublishAsync(It.IsAny<SchemaDefinitionExtended>(),
                DataChangeOperation.Deleted, It.IsAny<List<BsonDocument>>(), null), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task DeleteAsync_HardDelete_SkipsArchive()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument> { new BsonDocument { { "_id", "id-1" } } });

            await _service.DeleteAsync(SimpleSchema(), "id-1", hardDelete: true);

            _repo.Verify(r => r.InsertAsync(It.Is<string>(s => s.Contains("DataMutationRecord")), It.IsAny<BsonDocument>()), Times.Never);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task DeleteAsync_NotFound_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var result = await _service.DeleteAsync(SimpleSchema(), "missing", hardDelete: false);
            result.Acknowledged.Should().BeFalse();
            result.Message.Should().Contain("DELETE");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkInsertAsync_Empty_ReturnsZeroImpact()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var result = await _service.BulkInsertAsync(SimpleSchema(), new List<Dictionary<string, object?>>());
            result.Acknowledged.Should().BeTrue();
            result.TotalImpactedData.Should().Be(0);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkInsertAsync_Items_InsertsManyAndPublishes()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(userId: "u-1");
        try
        {
            var items = new List<Dictionary<string, object?>>
            {
                new() { ["Name"] = "A" },
                new() { ["Name"] = "B" }
            };
            var result = await _service.BulkInsertAsync(SimpleSchema(), items);

            result.Acknowledged.Should().BeTrue();
            result.TotalImpactedData.Should().Be(2);
            _repo.Verify(r => r.InsertManyAsync(It.IsAny<string>(), It.Is<List<BsonDocument>>(l => l.Count == 2)), Times.Once);
            _publisher.Verify(p => p.PublishAsync(It.IsAny<SchemaDefinitionExtended>(),
                DataChangeOperation.Inserted, It.IsAny<List<BsonDocument>>(), null), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkInsertAsync_DuplicateInBatch_Throws()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Email", isUnique: true) });
            var items = new List<Dictionary<string, object?>>
            {
                new() { ["Email"] = "same@x.com" },
                new() { ["Email"] = "same@x.com" }
            };
            var act = () => _service.BulkInsertAsync(schema, items);
            await act.Should().ThrowAsync<DataValidationException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkUpdateAsync_Found_UpdatesMany()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(userId: "u-1");
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument>
                {
                    new BsonDocument { { "_id", "1" } },
                    new BsonDocument { { "_id", "2" } }
                });

            var request = new GatewayBulkUpdateRequest
            {
                Filter = "{}",
                Input = new Dictionary<string, object?> { ["Name"] = "Updated" }
            };
            var result = await _service.BulkUpdateAsync(SimpleSchema(), request);

            result.Acknowledged.Should().BeTrue();
            _repo.Verify(r => r.UpdateManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkUpdateAsync_NoMatches_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var request = new GatewayBulkUpdateRequest { Filter = "{}", Input = new() { ["Name"] = "x" } };
            var result = await _service.BulkUpdateAsync(SimpleSchema(), request);
            result.Acknowledged.Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkDeleteAsync_SoftDelete_ArchivesAndDeletesMany()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                    It.IsAny<BsonDocument?>(), It.IsAny<BsonDocument?>(), It.IsAny<int>(), It.IsAny<int>()))
                .ReturnsAsync(new List<BsonDocument>
                {
                    new BsonDocument { { "_id", "1" } },
                    new BsonDocument { { "_id", "2" } }
                });

            var request = new GatewayBulkDeleteRequest { Filter = "{}", HardDelete = false };
            var result = await _service.BulkDeleteAsync(SimpleSchema(), request);

            result.Acknowledged.Should().BeTrue();
            _repo.Verify(r => r.InsertManyAsync(It.Is<string>(s => s.Contains("DataMutationRecord")), It.IsAny<List<BsonDocument>>()), Times.Once);
            _repo.Verify(r => r.DeleteManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkDeleteAsync_NoMatches_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var request = new GatewayBulkDeleteRequest { Filter = "{}" };
            var result = await _service.BulkDeleteAsync(SimpleSchema(), request);
            result.Acknowledged.Should().BeFalse();
        }
        finally { ClearContext(); }
    }
}
