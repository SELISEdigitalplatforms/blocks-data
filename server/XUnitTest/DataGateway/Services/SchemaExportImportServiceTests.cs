using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class SchemaExportServiceTests
{
    private readonly Mock<IMessageClient> _message = new();
    private readonly Mock<IDbRepository> _repo = new();
    private readonly SchemaExportService _service;

    public SchemaExportServiceTests()
    {
        BlocksTestContext.Set();
        _service = new SchemaExportService(_message.Object, _repo.Object, NullLogger<SchemaExportService>.Instance);
    }

    [Fact]
    public async Task InitiateExport_PublishesEvent()
    {
        var result = await _service.InitiateExportAsync(new ExportSchemaRequest { ExportOption = SchemaExportOption.All, MessageCoRelationId = "c1" });

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().NotBeNullOrEmpty();
        _message.Verify(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<SchemaExportEvent>>()), Times.Once);
    }

    [Fact]
    public async Task BuildExportBytes_SchemaOnly_NoPolicyOrValidationFetch()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", ItemId = "s1", Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } } });

        var (bytes, fileName) = await _service.BuildExportBytesAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.Schema });

        bytes.Should().NotBeEmpty();
        fileName.Should().StartWith("schema_export_");
        _repo.Verify(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, ""), Times.Never);
    }

    [Fact]
    public async Task BuildExportBytes_All_FetchesPoliciesAndValidations()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", ItemId = "s1", Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } } });
        _repo.Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, ""))
            .ReturnsAsync(new List<DataAccessPolicy>());
        _repo.Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, ""))
            .ReturnsAsync(new List<DataValidation>());

        var (bytes, _) = await _service.BuildExportBytesAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.All });

        bytes.Should().NotBeEmpty();
        _repo.Verify(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, ""), Times.Once);
        _repo.Verify(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, ""), Times.Once);
    }

    [Fact]
    public async Task InsertExportRecord_Inserts()
    {
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaExportRecord>(), "")).ReturnsAsync((SchemaExportRecord r, string _) => r);

        await _service.InsertExportRecordAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.Schema }, "file.json");

        _repo.Verify(r => r.InsertAsync(It.Is<SchemaExportRecord>(x => x.FileId == "f1" && x.FileName == "file.json"), ""), Times.Once);
    }
}

[Collection("ContextSerial")]
public class SchemaImportServiceTests
{
    private readonly Mock<IMessageClient> _message = new();
    private readonly Mock<IDbRepository> _repo = new();
    private readonly SchemaImportService _service;

    public SchemaImportServiceTests()
    {
        BlocksTestContext.Set();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), null, ""))
            .ReturnsAsync(new List<SchemaDefinition>());
        _repo.Setup(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), null, ""))
            .ReturnsAsync(new List<DataValidation>());
        _repo.Setup(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<SchemaChangeLog>>(), "")).ReturnsAsync(new List<SchemaChangeLog>());
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<DataAccessPolicy>>(), "")).ReturnsAsync(new List<DataAccessPolicy>());
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<DataValidation>>(), "")).ReturnsAsync(new List<DataValidation>());
        _service = new SchemaImportService(_message.Object, _repo.Object, NullLogger<SchemaImportService>.Instance, new SchemaImportValidator(_repo.Object));
    }

    private static byte[] Json(object o) => System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(o);

    [Fact]
    public async Task InitiateImport_PublishesEvent()
    {
        var result = await _service.InitiateImportAsync(new ImportSchemaRequest { FileId = "f1", MessageCoRelationId = "c1" });

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().Be("f1");
        _message.Verify(m => m.SendToConsumerAsync(It.IsAny<ConsumerMessage<SchemaImportEvent>>()), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_InvalidJson_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, new byte[] { 0x01, 0x02 }));
    }

    [Fact]
    public async Task ProcessImport_EmptyDocuments_ReturnsZero()
    {
        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(new List<SchemaExportDocument>()));
        count.Should().Be(0);
    }

    [Fact]
    public async Task ProcessImport_ValidationFails_Throws()
    {
        var docs = new List<SchemaExportDocument> { new() { SchemaName = "", Fields = new() } };
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs)));
    }

    [Fact]
    public async Task ProcessImport_NewSchema_Upserts()
    {
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "Person",
                CollectionName = "Persons",
                SchemaType = SchemaType.Entity,
                Fields = new() { new ExportFieldDefinition { Name = "Email", Type = "String" } }
            }
        };

        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), ""), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_WithPoliciesAndValidations_InsertsThem()
    {
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "Person",
                CollectionName = "Persons",
                SchemaType = SchemaType.Dto,
                RowLevelPolicies = new() { new ExportAccessPolicy { PolicyName = "R1", Operation = PolicyOperation.READ } },
                Fields = new()
                {
                    new ExportFieldDefinition
                    {
                        Name = "Email",
                        Type = "String",
                        AccessPolicies = new() { new ExportAccessPolicy { PolicyName = "C1", PolicyType = PolicyType.CLS, Operation = PolicyOperation.READ } },
                        ValidationRules = new() { new ExportValidationRule { Type = ValidationType.NotEmpty, IsActive = true } }
                    }
                }
            }
        };

        _repo.Setup(r => r.DeleteManyAsync(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync(new ActionResponse());

        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.InsertManyAsync(It.Is<List<DataAccessPolicy>>(l => l.Count == 2), ""), Times.Once);
        _repo.Verify(r => r.InsertManyAsync(It.Is<List<DataValidation>>(l => l.Count == 1), ""), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_ExistingSchema_UpdatesInPlace()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), null, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "existing", SchemaName = "Person", SchemaType = SchemaType.Entity } });

        var docs = new List<SchemaExportDocument>
        {
            new() { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity, Fields = new() { new ExportFieldDefinition { Name = "Email", Type = "String" } } }
        };

        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.UpsertManyAsync(It.Is<List<SchemaDefinition>>(l => l[0].ItemId == "existing"), ""), Times.Once);
    }
}
