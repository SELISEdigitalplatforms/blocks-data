using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis;
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
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "p"))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", ItemId = "s1", Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } } });

        var (bytes, fileName) = await _service.BuildExportBytesAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.Schema });

        bytes.Should().NotBeEmpty();
        fileName.Should().StartWith("schema_export_");
        _repo.Verify(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, "p"), Times.Never);
    }

    [Fact]
    public async Task BuildExportBytes_RejectsMissingTargetBeforeReading()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _service.BuildExportBytesAsync(
            new SchemaExportEvent { FileId = "f1", ProjectKey = "", ExportOption = SchemaExportOption.Schema }));
        _repo.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task BuildExportBytes_NeverExportsSystemEntities()
    {
        BsonDocument? sent = null;
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "p"))
            .Callback<FilterDefinition<BsonDocument>, SortDefinition<BsonDocument>?, ProjectionDefinition<BsonDocument>?, int, int, string>(
                (filter, _, _, _, _, _) => sent = RenderFilter(filter))
            .ReturnsAsync(new List<SchemaDefinition>());

        await _service.BuildExportBytesAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.Schema });

        sent.Should().NotBeNull();
        sent!["IsSystemEntity"].Should().Be(new BsonDocument("$ne", true));
    }

    private static BsonDocument RenderFilter(FilterDefinition<BsonDocument> filter) =>
        filter.Render(new RenderArgs<BsonDocument>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry));

    [Fact]
    public async Task BuildExportBytes_All_FetchesPoliciesAndValidations()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "p"))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", ItemId = "s1", Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } } });
        _repo.Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, "p"))
            .ReturnsAsync(new List<DataAccessPolicy>());
        _repo.Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, "p"))
            .ReturnsAsync(new List<DataValidation>());

        var (bytes, _) = await _service.BuildExportBytesAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.All });

        bytes.Should().NotBeEmpty();
        _repo.Verify(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, "p"), Times.Once);
        _repo.Verify(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 5000, "p"), Times.Once);
    }

    [Fact]
    public async Task BuildExportBytes_ReferenceField_PreservesReferenceFieldType()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "p"))
            .ReturnsAsync(new List<SchemaDefinition>
            {
                new()
                {
                    SchemaName = "Agreement",
                    ItemId = "s1",
                    Fields = new()
                    {
                        new FieldDefinition
                        {
                            Name = "Signatories.Signature.CoordinateId",
                            Type = "String",
                            IsReferenceField = true,
                            ReferenceFieldType = "Signature"
                        }
                    }
                }
            });

        var (bytes, _) = await _service.BuildExportBytesAsync(
            new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.Schema });

        var documents = System.Text.Json.JsonSerializer.Deserialize<List<SchemaExportDocument>>(bytes);
        documents![0].Fields[0].ReferenceFieldType.Should().Be("Signature");
    }

    [Fact]
    public async Task InsertExportRecord_WritesOneAuditRow_AndNoSchemaExportRecord()
    {
        BlocksTestContext.Set(userId: "exporter-1", tenantId: "p");
        BsonDocument? written = null;
        _repo.Setup(r => r.InsertAsync("ObjectAuditLogs", It.IsAny<BsonDocument>(), "p"))
            .Callback((string _, BsonDocument d, string _) => written = d)
            .ReturnsAsync((string _, BsonDocument d, string _) => d);

        await _service.InsertExportRecordAsync(new SchemaExportEvent { FileId = "f1", ProjectKey = "p", ExportOption = SchemaExportOption.All }, "file.json");

        _repo.Verify(r => r.InsertAsync("ObjectAuditLogs", It.IsAny<BsonDocument>(), "p"), Times.Once);
        _repo.Verify(r => r.InsertAsync("SchemaExportRecords", It.IsAny<BsonDocument>(), It.IsAny<string>()), Times.Never);
        written.Should().NotBeNull();
        written!["Action"].AsString.Should().Be("schema-export");
        written["ResourceType"].AsString.Should().Be("SchemaExport");
        written["ResourceId"].AsString.Should().Be("f1");
        written["UserId"].AsString.Should().Be("exporter-1");
        written["CreatedBy"].AsString.Should().Be("exporter-1");
        written["TenantId"].AsString.Should().Be("p");
        written["Granted"].AsBoolean.Should().BeTrue();
        written["_id"].IsString.Should().BeTrue();
        written["CreatedDate"].IsValidDateTime.Should().BeTrue();
        written.Contains("Record").Should().BeFalse();
        var detail = System.Text.Json.JsonDocument.Parse(written["Detail"].AsString).RootElement;
        detail.GetProperty("FileName").GetString().Should().Be("file.json");
        detail.GetProperty("ExportOption").GetString().Should().Be("All");
        BlocksTestContext.Clear();
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
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), null, "p"))
            .ReturnsAsync(new List<SchemaDefinition>());
        _repo.Setup(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), null, "p"))
            .ReturnsAsync(new List<DataValidation>());
        _repo.Setup(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), "p")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<SchemaChangeLog>>(), "p")).ReturnsAsync(new List<SchemaChangeLog>());
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<DataAccessPolicy>>(), "p")).ReturnsAsync(new List<DataAccessPolicy>());
        _repo.Setup(r => r.InsertManyAsync(It.IsAny<List<DataValidation>>(), "p")).ReturnsAsync(new List<DataValidation>());
        _service = new SchemaImportService(_message.Object, _repo.Object, NullLogger<SchemaImportService>.Instance, new SchemaImportValidator(_repo.Object));
    }

    private static byte[] Json(object o) => System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(o);

    [Fact]
    public async Task ProcessImport_RejectsMissingTargetBeforeWriting()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _service.ProcessImportAsync(
            new SchemaImportEvent { FileId = "f1", ProjectKey = "" }, Json(new List<SchemaExportDocument>())));
        _repo.VerifyNoOtherCalls();
    }

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
        await Assert.ThrowsAsync<SchemaImportValidationException>(() =>
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
        _repo.Verify(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), "p"), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_ReferenceFieldPathLongerThanFiftyCharacters_Upserts()
    {
        const string referenceFieldPath =
            "Signatories.Signature.SignaturePostInfoCoordinateFormFieldValues.CoordinateId";
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "Agreement",
                CollectionName = "Agreements",
                SchemaType = SchemaType.Entity,
                Fields = new()
                {
                    new ExportFieldDefinition
                    {
                        Name = referenceFieldPath,
                        Type = "String",
                        IsReferenceField = true
                    }
                }
            }
        };

        var count = await _service.ProcessImportAsync(
            new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.UpsertManyAsync(
            It.Is<List<SchemaDefinition>>(schemas =>
                schemas[0].Fields.Any(field => field.Name == referenceFieldPath)), "p"), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_ReferenceFieldWithSegmentLongerThanFiftyCharacters_Throws()
    {
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "Agreement",
                CollectionName = "Agreements",
                SchemaType = SchemaType.Entity,
                Fields = new()
                {
                    new ExportFieldDefinition
                    {
                        Name = $"Signatories.{new string('A', 51)}.CoordinateId",
                        Type = "String",
                        IsReferenceField = true
                    }
                }
            }
        };

        var exception = await Assert.ThrowsAsync<SchemaImportValidationException>(() =>
            _service.ProcessImportAsync(
                new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs)));

        exception.Message.Should().Contain("must be between 1 and 50 characters");
    }

    [Fact]
    public async Task ProcessImport_LegacyNestedReferenceFields_RestoresReferenceFieldType()
    {
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "Agreement",
                CollectionName = "Agreements",
                SchemaType = SchemaType.Entity,
                Fields = new()
                {
                    new ExportFieldDefinition { Name = "Signatories", Type = "Signatory" },
                    new ExportFieldDefinition
                    {
                        Name = "Signatories.Signature.CoordinateId",
                        Type = "String",
                        IsReferenceField = true
                    }
                }
            },
            new()
            {
                SchemaName = "Signatory",
                SchemaType = SchemaType.Dto,
                Fields = new() { new ExportFieldDefinition { Name = "Signature", Type = "Signature" } }
            },
            new()
            {
                SchemaName = "Signature",
                SchemaType = SchemaType.Dto,
                Fields = new() { new ExportFieldDefinition { Name = "CoordinateId", Type = "String" } }
            }
        };

        var count = await _service.ProcessImportAsync(
            new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(3);
        _repo.Verify(r => r.UpsertManyAsync(
            It.Is<List<SchemaDefinition>>(schemas => schemas
                .Single(schema => schema.SchemaName == "Agreement")
                .Fields.Single(field => field.Name == "Signatories.Signature.CoordinateId")
                .ReferenceFieldType == "Signature"), "p"), Times.Once);
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

        _repo.Setup(r => r.DeleteManyAsync(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "p")).ReturnsAsync(new ActionResponse());

        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.InsertManyAsync(It.Is<List<DataAccessPolicy>>(l => l.Count == 2), "p"), Times.Once);
        _repo.Verify(r => r.InsertManyAsync(It.Is<List<DataValidation>>(l => l.Count == 1), "p"), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_ExistingSchema_UpdatesInPlace()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), null, "p"))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "existing", SchemaName = "Person", SchemaType = SchemaType.Entity } });

        var docs = new List<SchemaExportDocument>
        {
            new() { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity, Fields = new() { new ExportFieldDefinition { Name = "Email", Type = "String" } } }
        };

        var count = await _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs));

        count.Should().Be(1);
        _repo.Verify(r => r.UpsertManyAsync(It.Is<List<SchemaDefinition>>(l => l[0].ItemId == "existing"), "p"), Times.Once);
    }

    // ---- #417: collection-name conflicts on import (§6.1, §6.2) ----

    private static SchemaExportDocument EntityDoc(string name, string collection) => new()
    {
        SchemaName = name, CollectionName = collection, SchemaType = SchemaType.Entity,
        Fields = new() { new ExportFieldDefinition { Name = "Title", Type = "String" } }
    };

    private static string RenderFilter(FilterDefinition<SchemaDefinition> filter) =>
        filter.Render(new RenderArgs<SchemaDefinition>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry)).ToString();

    /// <summary>
    /// Stored tenant schemas, answered per read the way MongoDB would: the system-entity read gets none, the
    /// conflict read (the only one with $or) gets every stored schema, the upsert's exact-case $in read gets
    /// the ordinal name matches. Records each read's databaseName.
    /// </summary>
    private List<string> GivenStoredSchemas(params SchemaDefinition[] stored)
    {
        var databases = new List<string>();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), null, It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> filter, SortDefinition<SchemaDefinition>? _, string database) =>
            {
                databases.Add(database);
                var rendered = RenderFilter(filter);
                if (rendered.Contains("\"IsSystemEntity\" : true", StringComparison.Ordinal))
                    return [];
                if (rendered.Contains("$or", StringComparison.Ordinal))
                    return stored.ToList();
                return stored.Where(s => rendered.Contains($"\"{s.SchemaName}\"", StringComparison.Ordinal)).ToList();
            });
        return databases;
    }

    private Task<int> ImportAsync(params SchemaExportDocument[] docs) =>
        _service.ProcessImportAsync(new SchemaImportEvent { FileId = "f1", ProjectKey = "p" }, Json(docs.ToList()));

    [Fact]
    public async Task ProcessImport_NewSchemaUsingAnExistingCollection_ImportsNothing()
    {
        // E5 / C6
        GivenStoredSchemas(new SchemaDefinition { ItemId = "o1", SchemaName = "Order", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity });

        var exception = await Assert.ThrowsAsync<SchemaImportValidationException>(() => ImportAsync(EntityDoc("Invoice", "sb_Orders")));

        exception.Errors.Should().Equal("Document[0]: CollectionName 'sb_Orders' is already used by schema 'Order'.");
        exception.Message.Should().StartWith("Import validation failed:\n");
        _repo.Verify(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ProcessImport_CaseVariantOfAnExistingName_CountsAsAnInsert_AndIsChecked()
    {
        // §6.1: "order" while "Order" exists inserts a new schema (the upsert matches names ordinally).
        GivenStoredSchemas(new SchemaDefinition { ItemId = "o1", SchemaName = "Order", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity });

        var exception = await Assert.ThrowsAsync<SchemaImportValidationException>(() => ImportAsync(EntityDoc("order", "SB_orders")));

        exception.Errors.Should().Equal("Document[0]: CollectionName 'SB_orders' is already used by schema 'Order'.");
    }

    [Fact]
    public async Task ProcessImport_TwoNewDocumentsWithTheSameCollection_RejectsTheSecond()
    {
        // E7: indexes 1 and 2 insert with sb_Tags and SB_tags; index 0 updates an existing schema reusing sb_Tags and does not count.
        GivenStoredSchemas(new SchemaDefinition { ItemId = "x1", SchemaName = "Existing", CollectionName = "sb_Existing", SchemaType = SchemaType.Entity });

        var exception = await Assert.ThrowsAsync<SchemaImportValidationException>(() =>
            ImportAsync(EntityDoc("Existing", "sb_Tags"), EntityDoc("Tag", "sb_Tags"), EntityDoc("Label", "SB_tags")));

        exception.Errors.Should().Equal("Document[2]: CollectionName 'SB_tags' is used by more than one document in this import file.");
        _repo.Verify(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ProcessImport_UpdateDocumentReusingACollection_AndOwnersOutsideTheRule_Import()
    {
        // H6 / C4: an update keeps its stored collection; a soft-deleted or system owner is not a conflict
        // (a system entity's collection stays reserved by the existing rule, covered by the validator tests).
        GivenStoredSchemas(
            new SchemaDefinition { ItemId = "o1", SchemaName = "Order", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity },
            new SchemaDefinition { ItemId = "d1", SchemaName = "Gone", CollectionName = "sb_Gone", SchemaType = SchemaType.Entity, IsDeleted = true },
            new SchemaDefinition { ItemId = "s1", SchemaName = "Audit", CollectionName = "sb_Audit", SchemaType = SchemaType.Entity, IsSystemEntity = true });

        var count = await ImportAsync(EntityDoc("Order", "sb_Other"), EntityDoc("Invoice", "sb_Gone"), EntityDoc("Tag", "sb_Tags"));

        count.Should().Be(3);
        _repo.Verify(r => r.UpsertManyAsync(It.Is<List<SchemaDefinition>>(l => l.Single(s => s.SchemaName == "Order").CollectionName == "sb_Orders"), "p"), Times.Once);
    }

    [Fact]
    public async Task ProcessImport_TwoStoredSchemasWithTheSameName_RejectsBeforeWriting()
    {
        // C7: today's ToDictionary threw ArgumentException here.
        GivenStoredSchemas(
            new SchemaDefinition { ItemId = "a", SchemaName = "Person", CollectionName = "sb_Persons", SchemaType = SchemaType.Entity },
            new SchemaDefinition { ItemId = "b", SchemaName = "Person", CollectionName = "sb_People", SchemaType = SchemaType.Entity, IsDeleted = true });

        var exception = await Assert.ThrowsAsync<SchemaImportValidationException>(() => ImportAsync(EntityDoc("Person", "sb_Persons")));

        exception.Errors.Should().Equal("SchemaName 'Person' matches more than one existing schema; resolve the duplicate before importing.");
        _repo.Verify(r => r.UpsertManyAsync(It.IsAny<List<SchemaDefinition>>(), It.IsAny<string>()), Times.Never);
        _repo.Verify(r => r.DeleteManyAsync(It.IsAny<FilterDefinition<DataAccessPolicy>>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ProcessImport_EveryValidatorRead_UsesTheEventsTenant_WithOneAdditionalRead()
    {
        // C13 / C12: system names, custom types, reference targets, the conflict read and the upsert read all read tenant "p".
        var databases = GivenStoredSchemas();
        var doc = EntityDoc("Invoice", "sb_Invoices");
        doc.Fields.Add(new ExportFieldDefinition { Name = "Customer", Type = "Address" });
        doc.Fields.Add(new ExportFieldDefinition
        {
            Name = "OrderId", Type = "String",
            ValidationRules = [new ExportValidationRule { Type = ValidationType.Reference, Value = "Order.ItemId" }]
        });

        await Assert.ThrowsAsync<SchemaImportValidationException>(() => ImportAsync(doc));

        databases.Should().HaveCount(4, "system names, custom types, reference targets and the one new conflict read")
            .And.OnlyContain(d => d == "p");
    }

}
