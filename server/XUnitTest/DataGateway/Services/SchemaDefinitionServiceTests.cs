using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using System.Net;
using MongoDB.Driver.Core.Clusters;
using MongoDB.Driver.Core.Connections;
using MongoDB.Driver.Core.Servers;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using SortDirection = DataGateway.DomainService.Models.SortDirection;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class SchemaDefinitionServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly Mock<ISchemaIndexService> _schemaIndexService = new();
    private readonly SchemaDefinitionReferenceHelper _refHelper;
    private readonly SchemaDefinitionService _service;

    public SchemaDefinitionServiceTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaDefinitionRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaDefinitionRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<SaveFieldDefinitionRequest>())).ReturnsAsync(new ValidationResult());
        // reference helper resolves nested references; keep them absent by default
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 100, "")).ReturnsAsync(new List<SchemaDefinition>());
        // Default for SchemaDefinitionService's own name-collision scan (FindCollidingSchemaNameAsync);
        // individual tests override this when they need to assert on a specific existing schema set.
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "")).ReturnsAsync(new List<SchemaDefinition>());
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync((SchemaDefinition s, string _) => s);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        // no schema has any index by default; SaveFieldDefinitionAsync's field-deletion guard and
        // its IsUniqueData reconciliation both go through ISchemaIndexService, never IDbRepository.
        _schemaIndexService.Setup(s => s.GetIndexesAsync(It.IsAny<string>()))
            .ReturnsAsync(new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse()));

        _refHelper = new SchemaDefinitionReferenceHelper(_repo.Object, _changeLog.Object);
        _service = new SchemaDefinitionService(_repo.Object, _validator.Object, _changeLog.Object, _refHelper, _schemaIndexService.Object, NullLogger<SchemaDefinitionService>.Instance);
    }

    private void NameIsUnique() => _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
    private void NameExists() => _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition());

    [Fact]
    public void Constructor_NullArgs_Throw()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionService(null!, _validator.Object, _changeLog.Object, _refHelper, _schemaIndexService.Object, NullLogger<SchemaDefinitionService>.Instance));
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionService(_repo.Object, _validator.Object, _changeLog.Object, _refHelper, null!, NullLogger<SchemaDefinitionService>.Instance));
    }

    [Fact]
    public async Task CreateSchema_Invalid_ReturnsErrors()
    {
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new ValidationResult(new[] { new ValidationFailure("SchemaName", "req") }));
        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest());
        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task CreateSchema_NameExists_Returns400()
    {
        NameExists();
        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.HttpStatusCode.Should().Be(400);
    }

    [Fact]
    public async Task CreateSchema_Entity_AddsDefaultFieldsAndInserts()
    {
        NameIsUnique();
        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsSuccess.Should().BeTrue();
        _repo.Verify(r => r.InsertAsync(It.Is<SchemaDefinition>(s => s.Fields.Count > 0), ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync(It.IsAny<string>(), SchemaChangeType.SchemaCreate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateSchema_NameCollidesWithExistingSchemaResultType_Returns400()
    {
        NameIsUnique();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "existing", SchemaName = "GeoV2PublicScanResult", IsDeleted = false } });

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "GeoV2PublicScan", CollectionName = "GeoV2PublicScans", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Contain("GeoV2PublicScanResult");
        _repo.Verify(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task CreateSchema_NameWouldBeCollidedByExistingSchemasResultType_Returns400()
    {
        NameIsUnique();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "existing", SchemaName = "GeoV2PublicScan", IsDeleted = false } });

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "GeoV2PublicScanResult", CollectionName = "GeoV2PublicScanResults", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Contain("GeoV2PublicScan");
    }

    [Fact]
    public async Task CreateSchema_NameDoesNotCollide_Inserts()
    {
        NameIsUnique();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "existing", SchemaName = "Address", IsDeleted = false } });

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateSchema_NotFound_Returns204()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "x", SchemaName = "P", CollectionName = "Ps", SchemaType = SchemaType.Entity });
        result.HttpStatusCode.Should().Be(204);
    }

    [Fact]
    public async Task UpdateSchema_RenameToNewUnusedName_Succeeds()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Old" });
        NameIsUnique(); // no schema at all currently has the target name
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "New", CollectionName = "News", SchemaType = SchemaType.Entity });
        result.IsSuccess.Should().BeTrue("renaming to a name nobody else uses must be allowed");
    }

    [Fact]
    public async Task UpdateSchema_Rename_CarriesReferenceRulesToTheNewName()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Department" });
        NameIsUnique();
        var pointing = new DataValidation
        {
            ItemId = "v1",
            FieldName = "DepartmentId",
            Validations =
            [
                new ValidationRule { Type = ValidationType.NotEmpty },
                new ValidationRule { Type = ValidationType.Reference, Value = "Department", SecondaryValue = "ItemId" },
                new ValidationRule { Type = ValidationType.Reference, Value = "Skill" },
            ],
        };
        _repo.Setup(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), null, ""))
            .ReturnsAsync([pointing]);
        List<DataValidation>? saved = null;
        _repo.Setup(r => r.UpdateManyAsync(It.IsAny<List<DataValidation>>(), ""))
            .Callback((List<DataValidation> list, string _) => saved = list)
            .ReturnsAsync(new ActionResponse { Acknowledged = true });

        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Dept", CollectionName = "Departments", SchemaType = SchemaType.Entity });

        // Only the rule that named the old schema changes.
        saved.Should().ContainSingle();
        saved![0].Validations.Select(r => r.Value as string).Should().Equal(null, "Dept", "Skill");
    }

    [Fact]
    public async Task UpdateSchema_SameName_DoesNotTouchValidations()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Department" });
        NameIsUnique();

        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Department", CollectionName = "Depts", SchemaType = SchemaType.Entity });

        _repo.Verify(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), It.IsAny<SortDefinition<DataValidation>?>(), ""), Times.Never);
    }

    [Fact]
    public async Task UpdateSchema_RenameToNameUsedByAnotherSchema_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Old" });
        // the name-lookup finds a DIFFERENT schema (ItemId "2") already using the requested name
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "2", SchemaName = "Taken" });
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Taken", CollectionName = "Ps", SchemaType = SchemaType.Entity });
        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Schema with the same name already exists");
        _repo.Verify(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task UpdateSchema_KeepingItsOwnCurrentName_Succeeds()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person" });
        // the name-lookup finds itself (same ItemId) — not a collision
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person" });
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateSchema_NameCollidesWithAnotherSchemasResultType_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "GeoV2PublicScan" });
        NameIsUnique(); // no OTHER schema is already named "GeoV2PublicScan"; the collision is via the derived suffix, checked separately below
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "2", SchemaName = "GeoV2PublicScanResult", IsDeleted = false } });

        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "GeoV2PublicScan", CollectionName = "GeoV2PublicScans", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Contain("GeoV2PublicScanResult");
        _repo.Verify(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task UpdateSchema_KeepingOwnName_DoesNotCollideWithItself()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person" });
        NameIsUnique();
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "1", SchemaName = "Person", IsDeleted = false } });

        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task SaveFieldDefinition_NotFound_Returns204()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest { SchemaDefinitionItemId = "x", Fields = new() });
        result.HttpStatusCode.Should().Be(204);
    }

    [Fact]
    public async Task SaveFieldDefinition_AddsUpdatesAndDeletesFields()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinition { Name = "Old", Type = "String" }, new FieldDefinition { Name = "Keep", Type = "String" } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            DeletableFieldNames = new[] { "Old" },
            Fields = new()
            {
                new FieldDefinitionRequest { Name = "Keep", Type = "Int" },
                new FieldDefinitionRequest { Name = "New", Type = "String" }
            }
        });

        result.IsSuccess.Should().BeTrue();
        schema.Fields.Should().NotContain(f => f.Name == "Old");
        schema.Fields.First(f => f.Name == "Keep").Type.Should().Be("Int");
        schema.Fields.Should().Contain(f => f.Name == "New");
    }

    private SchemaDefinition GeoSchema(params FieldDefinition[] fields)
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Stores",
            Fields = fields.ToList()
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        return schema;
    }

    private static SaveFieldDefinitionRequest SaveRequest(string name, string type, string[]? deleted = null, bool isArray = false) => new()
    {
        SchemaDefinitionItemId = "1",
        DeletableFieldNames = deleted is { Length: > 0 } ? deleted : null,
        Fields = new() { new FieldDefinitionRequest { Name = name, Type = type, IsArray = isArray } }
    };

    private void VerifyGeoIndexCreated(Times times) =>
        _repo.Verify(r => r.CreateGeoIndexAsync("Stores", "location", "location_2dsphere", ""), times);

    private void VerifyNoGeoIndexTouched()
    {
        _repo.Verify(r => r.CreateGeoIndexAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        _repo.Verify(r => r.DropIndexAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SaveFieldDefinition_NewGeoJsonField_Creates2dsphereIndex()
    {
        GeoSchema();

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        VerifyGeoIndexCreated(Times.Once());
    }

    [Fact]
    public async Task SaveFieldDefinition_UnchangedGeoJsonField_RequestsTheSameNamedIndex_SoItIsIdempotent()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson" });

        var first = await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));
        var second = await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        first.IsSuccess.Should().BeTrue();
        second.IsSuccess.Should().BeTrue();
        // The deterministic name is what makes the repeat a Mongo no-op rather than a duplicate.
        VerifyGeoIndexCreated(Times.Exactly(2));
        _repo.Verify(r => r.DropIndexAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SaveFieldDefinition_TypeChangedToGeoJson_Creates2dsphereIndex()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "String" });

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        VerifyGeoIndexCreated(Times.Once());
    }

    [Fact]
    public async Task SaveFieldDefinition_ArrayGeoJsonField_IsNotIndexed_BecauseMongoCannotIndexIt()
    {
        GeoSchema();

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson", isArray: true));

        VerifyNoGeoIndexTouched();
    }

    [Fact]
    public async Task SaveFieldDefinition_GeoJsonFieldMadeArray_DropsItsIndex()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson" });

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson", isArray: true));

        _repo.Verify(r => r.DropIndexAsync("Stores", "location_2dsphere", ""), Times.Once);
        VerifyGeoIndexCreated(Times.Never());
    }

    [Fact]
    public async Task SaveFieldDefinition_ArrayGeoJsonFieldMadeSingle_Creates2dsphereIndex()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson", IsArray = true });

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        VerifyGeoIndexCreated(Times.Once());
    }

    [Fact]
    public async Task SaveFieldDefinition_GeoJsonFieldDeleted_DropsItsIndex()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson" }, new FieldDefinition { Name = "name", Type = "String" });

        var result = await _service.SaveFieldDefinitionAsync(SaveRequest("name", "String", ["location"]));

        result.IsSuccess.Should().BeTrue();
        _repo.Verify(r => r.DropIndexAsync("Stores", "location_2dsphere", ""), Times.Once);
        VerifyGeoIndexCreated(Times.Never());
    }

    [Fact]
    public async Task SaveFieldDefinition_GeoJsonTypeChangedAway_DropsItsIndex()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson" });

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "String"));

        _repo.Verify(r => r.DropIndexAsync("Stores", "location_2dsphere", ""), Times.Once);
        VerifyGeoIndexCreated(Times.Never());
    }

    [Fact]
    public async Task SaveFieldDefinition_DropOfAnIndexThatIsAlreadyGone_DoesNotFailTheSave()
    {
        GeoSchema(new FieldDefinition { Name = "location", Type = "GeoJson" });
        _repo.Setup(r => r.DropIndexAsync("Stores", "location_2dsphere", ""))
            .ThrowsAsync(MongoIndexNotFound());

        var result = await _service.SaveFieldDefinitionAsync(SaveRequest("location", "String"));

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task SaveFieldDefinition_IndexCreationFailure_DoesNotFailTheSave()
    {
        GeoSchema();
        _repo.Setup(r => r.CreateGeoIndexAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("boom"));

        var result = await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task SaveFieldDefinition_GeoJsonOnDtoSchema_CreatesNoIndex()
    {
        GeoSchema().SchemaType = SchemaType.Dto;

        await _service.SaveFieldDefinitionAsync(SaveRequest("location", "GeoJson"));

        VerifyNoGeoIndexTouched();
    }

    [Fact]
    public async Task SaveFieldDefinition_NonGeoJsonFields_TouchNoGeoIndex()
    {
        GeoSchema(new FieldDefinition { Name = "name", Type = "String" });

        await _service.SaveFieldDefinitionAsync(SaveRequest("name", "String"));

        VerifyNoGeoIndexTouched();
    }

    private static MongoCommandException MongoIndexNotFound() =>
        new(new ConnectionId(new ServerId(new ClusterId(), new DnsEndPoint("localhost", 27017))),
            "index not found", new BsonDocument("ok", 0), new BsonDocument { { "code", 27 } });

    private static ServiceResponse<SchemaIndexListResponse> IndexListResponse(params SchemaIndexResponse[] indexes) =>
        new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse { Indexes = indexes.ToList() });

    [Fact]
    public async Task SaveFieldDefinition_DeletingFieldUsedByIndex_Returns400AndLeavesFieldsUnchanged()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinition { Name = "email", Type = "String" } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.GetIndexesAsync("1")).ReturnsAsync(IndexListResponse(new SchemaIndexResponse
        {
            ItemId = "idx-1",
            Name = "email_1",
            IsUnique = false,
            Fields = new() { new IndexFieldResponse { FieldName = "email", Direction = SortDirection.ASC } }
        }));

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            DeletableFieldNames = new[] { "email" },
            Fields = new()
        });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Contain("email_1");
        schema.Fields.Should().Contain(f => f.Name == "email", "the field must stay untouched when its deletion is rejected");
    }

    [Fact]
    public async Task SaveFieldDefinition_SetsFieldUnique_DelegatesIndexCreationToSchemaIndexService()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Customers",
            Fields = new() { new FieldDefinition { Name = "email", Type = "String", IsUniqueData = false } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.CreateIndexAsync(It.IsAny<CreateSchemaIndexRequest>()))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = "idx-1" }));

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            Fields = new() { new FieldDefinitionRequest { Name = "email", Type = "String", IsUniqueData = true } }
        });

        result.IsSuccess.Should().BeTrue();
        _schemaIndexService.Verify(s => s.CreateIndexAsync(It.Is<CreateSchemaIndexRequest>(r =>
            r.SchemaDefinitionItemId == "1" &&
            r.IsUnique &&
            r.Fields.Count == 1 &&
            r.Fields[0].FieldName == "email" &&
            r.Fields[0].Direction == SortDirection.ASC)), Times.Once);
    }

    [Fact]
    public async Task SaveFieldDefinition_UniqueIndexCreationFails_FieldSaveStillSucceeds()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Customers",
            Fields = new() { new FieldDefinition { Name = "email", Type = "String" } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.CreateIndexAsync(It.IsAny<CreateSchemaIndexRequest>()))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetErrorMessage("UNIQUE_INDEX_CONFLICT").SetHttpStatusCode(409));

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            Fields = new() { new FieldDefinitionRequest { Name = "email", Type = "String", IsUniqueData = true } }
        });

        result.IsSuccess.Should().BeTrue("the field save must succeed even when SchemaIndexService can't build the underlying index");
    }

    [Fact]
    public async Task SaveFieldDefinition_UnsetsFieldUnique_DelegatesIndexDeletionToSchemaIndexService()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Customers",
            Fields = new() { new FieldDefinition { Name = "email", Type = "String", IsUniqueData = true } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.GetIndexesAsync("1")).ReturnsAsync(IndexListResponse(new SchemaIndexResponse
        {
            ItemId = "idx-1",
            Name = "email_1",
            IsUnique = true,
            Fields = new() { new IndexFieldResponse { FieldName = "email", Direction = SortDirection.ASC } }
        }));
        _schemaIndexService.Setup(s => s.DeleteIndexAsync("idx-1"))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true }));

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            Fields = new() { new FieldDefinitionRequest { Name = "email", Type = "String", IsUniqueData = false } }
        });

        result.IsSuccess.Should().BeTrue();
        _schemaIndexService.Verify(s => s.DeleteIndexAsync("idx-1"), Times.Once);
    }

    [Fact]
    public async Task SaveFieldDefinition_DeletingFieldWithOnlyItsOwnUniqueIndex_IsAllowedAndDropsIndex()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Customers",
            Fields = new() { new FieldDefinition { Name = "email", Type = "String", IsUniqueData = true } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.GetIndexesAsync("1")).ReturnsAsync(IndexListResponse(new SchemaIndexResponse
        {
            ItemId = "idx-1",
            Name = "email_1",
            IsUnique = true,
            Fields = new() { new IndexFieldResponse { FieldName = "email", Direction = SortDirection.ASC } }
        }));
        _schemaIndexService.Setup(s => s.DeleteIndexAsync("idx-1"))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true }));

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            DeletableFieldNames = new[] { "email" },
            Fields = new()
        });

        result.IsSuccess.Should().BeTrue("a field's own single-field unique index must not block deleting that field");
        schema.Fields.Should().NotContain(f => f.Name == "email");
        _schemaIndexService.Verify(s => s.DeleteIndexAsync("idx-1"), Times.Once);
    }

    [Fact]
    public async Task SaveFieldDefinition_FieldStaysUniqueAcrossSaves_DoesNotResurrectAManuallyDeletedIndex()
    {
        // Simulates: the field's auto-managed index was deleted manually via the Indexes tab while
        // IsUniqueData stayed checked. The frontend resubmits every field on every save, so a later,
        // unrelated save that resends this field with IsUniqueData still true must NOT recreate the
        // index — only an actual off->on transition should.
        var schema = new SchemaDefinition
        {
            ItemId = "1",
            SchemaType = SchemaType.Entity,
            CollectionName = "Customers",
            Fields = new() { new FieldDefinition { Name = "email", Type = "String", IsUniqueData = true } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _schemaIndexService.Setup(s => s.GetIndexesAsync("1")).ReturnsAsync(IndexListResponse());

        var result = await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            Fields = new() { new FieldDefinitionRequest { Name = "email", Type = "String", IsUniqueData = true } }
        });

        result.IsSuccess.Should().BeTrue();
        _schemaIndexService.Verify(s => s.CreateIndexAsync(It.IsAny<CreateSchemaIndexRequest>()), Times.Never);
    }

    [Fact]
    public async Task CreateSchemaDefinition_Entity_Inserts()
    {
        NameIsUnique();
        var result = await _service.CreateSchemaDefinitionAsync(new CreateSchemaDefinitionRequest
        {
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task CreateSchemaDefinition_EntityWithGeoJsonField_Creates2dsphereIndex()
    {
        NameIsUnique();

        await _service.CreateSchemaDefinitionAsync(new CreateSchemaDefinitionRequest
        {
            SchemaName = "Store",
            CollectionName = "Stores",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinitionRequest { Name = "location", Type = "GeoJson" },
                new FieldDefinitionRequest { Name = "waypoints", Type = "GeoJson", IsArray = true },
            }
        });

        VerifyGeoIndexCreated(Times.Once());
        _repo.Verify(r => r.CreateGeoIndexAsync(It.IsAny<string>(), "waypoints", It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task CreateSchemaDefinition_Dto_CreatesNoGeoIndex()
    {
        NameIsUnique();

        await _service.CreateSchemaDefinitionAsync(new CreateSchemaDefinitionRequest
        {
            SchemaName = "Stop",
            CollectionName = "Stops",
            SchemaType = SchemaType.Dto,
            Fields = new() { new FieldDefinitionRequest { Name = "location", Type = "GeoJson" } }
        });

        VerifyNoGeoIndexTouched();
    }

    private void SetUpSchemaForUpdate(params FieldDefinition[] fields)
    {
        var schema = new SchemaDefinition { ItemId = "1", SchemaName = "Store", CollectionName = "Stores", SchemaType = SchemaType.Entity, Fields = fields.ToList() };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Store" });
    }

    private Task<ServiceResponse<ActionResponse>> UpdateWith(params FieldDefinitionRequest[] fields) =>
        _service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "1",
            SchemaName = "Store",
            CollectionName = "Stores",
            SchemaType = SchemaType.Entity,
            Fields = fields.ToList()
        });

    [Fact]
    public async Task UpdateSchemaDefinition_AddedGeoJsonField_Creates2dsphereIndex()
    {
        SetUpSchemaForUpdate();

        await UpdateWith(new FieldDefinitionRequest { Name = "location", Type = "GeoJson" });

        VerifyGeoIndexCreated(Times.Once());
    }

    [Fact]
    public async Task UpdateSchemaDefinition_GeoJsonFieldRemovedFromList_DropsItsIndex()
    {
        SetUpSchemaForUpdate(new FieldDefinition { Name = "location", Type = "GeoJson" });

        await UpdateWith(new FieldDefinitionRequest { Name = "name", Type = "String" });

        _repo.Verify(r => r.DropIndexAsync("Stores", "location_2dsphere", ""), Times.Once);
        VerifyGeoIndexCreated(Times.Never());
    }

    [Fact]
    public async Task UpdateSchemaDefinition_UnrelatedFields_TouchNoGeoIndex()
    {
        SetUpSchemaForUpdate(new FieldDefinition { Name = "name", Type = "String" });

        await UpdateWith(new FieldDefinitionRequest { Name = "name", Type = "String" });

        VerifyNoGeoIndexTouched();
    }

    [Fact]
    public async Task UpdateSchemaDefinition_Valid_Updates()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person" });
        // the name-lookup finds itself (same ItemId) — not a collision
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person" });
        var result = await _service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "1",
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateSchemaDefinition_RenameToNameUsedByAnotherSchema_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Old" });
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "2", SchemaName = "Taken" });
        var result = await _service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "1",
            SchemaName = "Taken",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Schema with the same name already exists");
    }

    [Fact]
    public async Task DeleteSchema_NotFound_Returns204()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var result = await _service.DeleteSchemaAsync("x");
        result.HttpStatusCode.Should().Be(204);
    }

    [Fact]
    public async Task DeleteSchema_Found_Deletes()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1" });
        _repo.Setup(r => r.DeleteAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "1" });
        var result = await _service.DeleteSchemaAsync("1");
        result.IsSuccess.Should().BeTrue();
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("1", SchemaChangeType.SchemaDelete, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeleteSchema_Found_TellsTheOwnersWhatWasDeleted()
    {
        var schema = new SchemaDefinition { ItemId = "1", SchemaName = "Person" };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        _repo.Setup(r => r.DeleteAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "1" });

        await _service.DeleteSchemaAsync("1");

        _changeLog.Verify(c => c.NotifyChangedAsync(schema, SchemaChangeType.SchemaDelete), Times.Once);
    }

    [Fact]
    public async Task DeleteSchema_NotFound_NotifiesNobody()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);

        await _service.DeleteSchemaAsync("x");

        _changeLog.Verify(c => c.NotifyChangedAsync(It.IsAny<SchemaDefinition>(), It.IsAny<SchemaChangeType>()), Times.Never);
    }

    [Fact]
    public async Task GetSchemaById_NotFound_Returns204()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var result = await _service.GetSchemaByIdAsync("x");
        result.HttpStatusCode.Should().Be(204);
    }

    [Fact]
    public async Task GetSchemaById_Found_ReturnsResponse()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person", SchemaType = SchemaType.Entity, Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } });
        _repo.Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "")).ReturnsAsync(new List<DataValidation>());
        _repo.Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "")).ReturnsAsync(new List<DataAccessPolicy>());

        var result = await _service.GetSchemaByIdAsync("1");
        result.IsSuccess.Should().BeTrue();
        result.Data!.SchemaName.Should().Be("Person");
    }

    [Fact]
    public async Task GetAllSchemas_ReturnsPaged()
    {
        _repo.Setup(r => r.GetItemsWithCountAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>>(), It.IsAny<ProjectionDefinition<BsonDocument>>(), It.IsAny<int>(), It.IsAny<int>(), ""))
            .ReturnsAsync((new List<SchemaDefinition> { new() { ItemId = "1", SchemaName = "Person", SchemaType = SchemaType.Entity } }, 1));

        var result = await _service.GetAllSchemasAsync(new GetSchemaDefinitionListRequest { PageNo = 1, PageSize = 10 });
        result.TotalCount.Should().Be(1);
    }

    private SchemaDefinitionService ServiceWithLiveSchemas(IReadOnlySet<string>? liveIds)
    {
        var catalog = new Mock<ILiveSchemaCatalog>();
        catalog.Setup(c => c.GetLiveSchemaIdsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(liveIds);
        return new SchemaDefinitionService(_repo.Object, _validator.Object, _changeLog.Object, _refHelper, _schemaIndexService.Object, NullLogger<SchemaDefinitionService>.Instance, catalog.Object);
    }

    private void ListReturns(params string[] ids) =>
        _repo.Setup(r => r.GetItemsWithCountAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>>(), It.IsAny<ProjectionDefinition<BsonDocument>>(), It.IsAny<int>(), It.IsAny<int>(), ""))
            .ReturnsAsync((ids.Select(id => new SchemaDefinition { ItemId = id, SchemaName = $"S{id}", SchemaType = SchemaType.Entity }).ToList(), ids.Length));

    [Fact]
    public async Task GetAllSchemas_MarksWhichSchemasTheLiveVersionContains()
    {
        ListReturns("live", "added-later");

        var result = await ServiceWithLiveSchemas(new HashSet<string> { "live" })
            .GetAllSchemasAsync(new GetSchemaDefinitionListRequest { PageNo = 1, PageSize = 10 });

        result.Items.Single(s => s.Id == "live").IsLive.Should().BeTrue();
        result.Items.Single(s => s.Id == "added-later").IsLive.Should().BeFalse();
    }

    [Fact]
    public async Task GetAllSchemas_LeavesTheLiveStateUnknownWithoutALiveVersion()
    {
        ListReturns("1");

        var result = await ServiceWithLiveSchemas(null).GetAllSchemasAsync(new GetSchemaDefinitionListRequest { PageNo = 1, PageSize = 10 });

        result.Items.Single().IsLive.Should().BeNull();
    }

    [Fact]
    public async Task GetSchemaById_MarksWhetherTheLiveVersionContainsIt()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1", SchemaName = "Person", SchemaType = SchemaType.Entity });
        _repo.Setup(r => r.GetItemsAsync<DataValidation>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "")).ReturnsAsync(new List<DataValidation>());
        _repo.Setup(r => r.GetItemsAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, "")).ReturnsAsync(new List<DataAccessPolicy>());

        var result = await ServiceWithLiveSchemas(new HashSet<string> { "other" }).GetSchemaByIdAsync("1");

        result.Data!.IsLive.Should().BeFalse();
    }

    [Fact]
    public async Task GetAllSchemas_HidesSystemEntities()
    {
        BsonDocument? sent = null;
        _repo.Setup(r => r.GetItemsWithCountAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<SortDefinition<BsonDocument>>(), It.IsAny<ProjectionDefinition<BsonDocument>>(), It.IsAny<int>(), It.IsAny<int>(), ""))
            .Callback<FilterDefinition<BsonDocument>, SortDefinition<BsonDocument>?, ProjectionDefinition<BsonDocument>?, int, int, string>(
                (filter, _, _, _, _, _) => sent = RenderFilter(filter))
            .ReturnsAsync((new List<SchemaDefinition>(), 0L));

        await _service.GetAllSchemasAsync(new GetSchemaDefinitionListRequest { PageNo = 1, PageSize = 10, Keyword = "Ro" });

        sent!["IsSystemEntity"].Should().Be(new BsonDocument("$ne", true));
        sent.Contains("SchemaName").Should().BeTrue("the caller's own filter is kept");
    }

    private static BsonDocument RenderFilter(FilterDefinition<BsonDocument> filter) =>
        filter.Render(new RenderArgs<BsonDocument>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry));

    [Fact]
    public async Task GetSchemaAggregation_MapsCounts()
    {
        var doc = new BsonDocument
        {
            { "ReadPublic", 2 }, { "ReadUser", 1 }, { "ReadCustom", 0 },
            { "WritePublic", 1 }, { "WriteUser", 0 }, { "WriteCustom", 0 },
            { "EditPublic", 0 }, { "EditUser", 0 }, { "EditCustom", 1 },
            { "DeletePublic", 0 }, { "DeleteUser", 0 }, { "DeleteCustom", 0 }
        };
        _repo.Setup(r => r.AggregateOneAsync<SchemaDefinition>(It.IsAny<BsonDocument[]>(), "")).ReturnsAsync(doc);

        var result = await _service.GetSchemaAggregationAsync();

        result.IsSuccess.Should().BeTrue();
        result.Data!.Read.Public.Should().Be(2);
        result.Data.TotalPublicPermission.Should().Be(3);
        result.Data.TotalCustomPermission.Should().Be(1);
    }

    [Fact]
    public async Task GetSchemaAggregation_NullDoc_Zeroes()
    {
        _repo.Setup(r => r.AggregateOneAsync<SchemaDefinition>(It.IsAny<BsonDocument[]>(), "")).ReturnsAsync((BsonDocument?)null);
        var result = await _service.GetSchemaAggregationAsync();
        result.Data!.TotalPublicPermission.Should().Be(0);
    }

    [Fact]
    public async Task ResetSchemaStructure_ReturnsPerSchemaStatus()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { ItemId = "1", SchemaName = "Person", SchemaType = SchemaType.Entity } });

        var result = await _service.ResetSchemaStructureAsync();

        result.Should().ContainKey("Person");
        result["Person"].Should().BeTrue();
    }

    [Fact]
    public async Task GetEntityCollections_ReturnsSummaries()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity } });

        var result = await _service.GetEntityCollectionsAsync();
        result.Data!.Collections.Should().ContainSingle(c => c.Name == "Person");
    }

    [Fact]
    public async Task GetEntityCollectionByName_NotFound_Returns404()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1, ""))
            .ReturnsAsync(new List<SchemaDefinition>());
        var result = await _service.GetEntityCollectionByNameAsync("Person");
        result.HttpStatusCode.Should().Be(404);
    }

    [Fact]
    public async Task GetEntityCollectionByName_Found_ReturnsDetail()
    {
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1, ""))
            .ReturnsAsync(new List<SchemaDefinition> { new() { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity, Fields = new() { new FieldDefinition { Name = "Email", Type = "String" } } } });

        var result = await _service.GetEntityCollectionByNameAsync("Person");
        result.IsSuccess.Should().BeTrue();
        result.Data!.Fields.Should().NotBeEmpty();
    }

    // ---- Default values --------------------------------------------------------------------------

    private SchemaDefinition EmployeeWithFields(params FieldDefinition[] fields)
    {
        var schema = new SchemaDefinition { ItemId = "emp", SchemaName = "Employee", SchemaType = SchemaType.Entity, Fields = fields.ToList() };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("emp", "")).ReturnsAsync(schema);
        return schema;
    }

    private static SetFieldDefaultRequest Default(string field, DefaultValueKind kind, object? value = null) =>
        new() { SchemaId = "emp", FieldName = field, DefaultValue = new FieldDefaultValueRequest { Kind = kind, Value = value } };

    [Fact]
    public async Task SetFieldDefault_SavesIt_AndMarksTheSchemaChanged()
    {
        var schema = EmployeeWithFields(new FieldDefinition { Name = "FirstName", Type = "String" }, new FieldDefinition { Name = "DisplayName", Type = "String" });

        var result = await _service.SetFieldDefaultAsync(Default("DisplayName", DefaultValueKind.Template, "{{Employee.FirstName}}"));

        result.IsSuccess.Should().BeTrue();
        schema.Fields[1].DefaultValue!.Value.Should().Be("{{Employee.FirstName}}");
        _repo.Verify(r => r.UpdateAsync(schema, ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("emp", SchemaChangeType.SchemaFieldUpdate), Times.Once);
    }

    [Fact]
    public async Task SetFieldDefault_Null_ClearsIt()
    {
        var schema = EmployeeWithFields(new FieldDefinition { Name = "Code", Type = "String", DefaultValue = new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = "NEW" } });

        var result = await _service.SetFieldDefaultAsync(new SetFieldDefaultRequest { SchemaId = "emp", FieldName = "Code" });

        result.IsSuccess.Should().BeTrue();
        schema.Fields[0].DefaultValue.Should().BeNull();
    }

    [Fact]
    public async Task SetFieldDefault_Refused_WithTheReason()   // UC16
    {
        EmployeeWithFields(new FieldDefinition { Name = "FirstName", Type = "String" }, new FieldDefinition { Name = "DisplayName", Type = "String" },
            new FieldDefinition { Name = "CreatedDate", Type = "DateTime" });

        (await _service.SetFieldDefaultAsync(Default("DisplayName", DefaultValueKind.Template, "{{Employee.FirstNme}}"))).Message.Should()
            .Be("Unknown property \"Employee.FirstNme\" at position 1 (did you mean Employee.FirstName?)");
        (await _service.SetFieldDefaultAsync(Default("CreatedDate", DefaultValueKind.Now))).Message.Should()
            .Be("CreatedDate is set by the platform and can't have a default value");
        (await _service.SetFieldDefaultAsync(Default("Nope", DefaultValueKind.Static, "x"))).HttpStatusCode.Should().Be(400);
        _repo.Verify(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task SaveFields_KeepsADefault_AndClearsItWhenTheTypeChanges()
    {
        var keep = new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = "NEW" };
        var schema = EmployeeWithFields(
            new FieldDefinition { Name = "Code", Type = "String", DefaultValue = keep },
            new FieldDefinition { Name = "Score", Type = "String", DefaultValue = new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = "5" } });

        await _service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "emp",
            Fields = [new FieldDefinitionRequest { Name = "Code", Type = "String", Description = "edited" }, new FieldDefinitionRequest { Name = "Score", Type = "Int" }],
        });

        schema.Fields.Single(f => f.Name == "Code").DefaultValue.Should().BeSameAs(keep);
        schema.Fields.Single(f => f.Name == "Score").DefaultValue.Should().BeNull();
    }

    [Fact]
    public async Task NestedDefault_SurvivesTheChildSchemaBeingRefreshed()
    {
        // Employee keeps its own default on the flattened entry Read.Roles; refreshing the child (Access) fields must not drop it.
        var mine = new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = new object[] { "admin" } };
        var employee = new SchemaDefinition
        {
            ItemId = "emp", SchemaName = "Employee", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Read", Type = "Access" }, new FieldDefinition { Name = "Read.Roles", Type = "String", IsArray = true, IsReferenceField = true, DefaultValue = mine }],
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(
            new SchemaDefinition { SchemaName = "Access", SchemaType = SchemaType.Dto, Fields = [new FieldDefinition { Name = "Roles", Type = "String", IsArray = true, Description = "changed" }] });

        await _refHelper.AddReferenceInnerFieldsToSchemaAsync(employee);

        employee.Fields.Single(f => f.Name == "Read.Roles").DefaultValue.Should().BeSameAs(mine);
    }

    [Fact]
    public async Task Rename_RewritesTheSchemaPrefix_InTemplates()   // UC19
    {
        var schema = EmployeeWithFields(new FieldDefinition
        {
            Name = "DisplayName", Type = "String",
            DefaultValue = new FieldDefaultValue { Kind = DefaultValueKind.Template, Value = "{{Employee.FirstName}} ({{Auth.Email}})" },
        });
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        NameIsUnique();

        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "emp", SchemaName = "Staff", CollectionName = "Staff", SchemaType = SchemaType.Entity });

        schema.Fields[0].DefaultValue!.Value.Should().Be("{{Staff.FirstName}} ({{Auth.Email}})");
    }

    [Fact]
    public async Task Rename_RewritesTheSchemaPrefix_InVersionOneValidationValues()   // UC19
    {
        var schema = EmployeeWithFields(new FieldDefinition { Name = "EndDate", Type = "DateTime" });
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);
        NameIsUnique();
        var variable = new ValidationRule { Type = ValidationType.Range, Value = "{{Employee.StartDate}}", SecondaryValue = "{{ Employee.LastDay }}", EvaluationVersion = 1 };
        var legacy = new ValidationRule { Type = ValidationType.Equal, Value = "{{Employee.StartDate}}" };   // version 0: fixed text
        var validation = new DataValidation { ItemId = "v1", SchemaId = "emp", FieldName = "EndDate", Validations = [variable, legacy] };
        _repo.Setup(r => r.GetItemsAsync<DataValidation, DataValidation>(It.IsAny<FilterDefinition<DataValidation>>(), null, ""))
            .ReturnsAsync([validation]);
        _repo.Setup(r => r.UpdateManyAsync(It.IsAny<List<DataValidation>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "emp", SchemaName = "Staff", CollectionName = "Staff", SchemaType = SchemaType.Entity });

        variable.Value.Should().Be("{{Staff.StartDate}}");
        variable.SecondaryValue.Should().Be("{{ Staff.LastDay }}");
        legacy.Value.Should().Be("{{Employee.StartDate}}");
        _repo.Verify(r => r.UpdateManyAsync(It.Is<List<DataValidation>>(l => l.Contains(validation)), ""), Times.AtLeastOnce);
    }
}


[Collection("ContextSerial")]
public class SchemaDefinitionReferenceHelperTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly SchemaDefinitionReferenceHelper _helper;

    public SchemaDefinitionReferenceHelperTests()
    {
        BlocksTestContext.Set();
        _helper = new SchemaDefinitionReferenceHelper(_repo.Object, _changeLog.Object);
    }

    [Fact]
    public void Constructor_NullArgs_Throw()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionReferenceHelper(null!, _changeLog.Object));
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionReferenceHelper(_repo.Object, null!));
    }

    [Fact]
    public async Task AddReferenceInnerFields_Dto_NoOp()
    {
        var schema = new SchemaDefinition { SchemaType = SchemaType.Dto, Fields = new() { new FieldDefinition { Name = "X", Type = "String" } } };
        await _helper.AddReferenceInnerFieldsToSchemaAsync(schema);
        schema.Fields.Should().HaveCount(1);
    }

    [Fact]
    public async Task AddReferenceInnerFields_ExpandsReferencedSchema()
    {
        var referenced = new SchemaDefinition
        {
            SchemaName = "ContactInfo",
            SchemaType = SchemaType.Dto,
            Fields = new() { new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Phone", Type = "String" } }
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(referenced);

        var schema = new SchemaDefinition
        {
            SchemaName = "Person",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinition { Name = "Contact", Type = "ContactInfo" } }
        };

        await _helper.AddReferenceInnerFieldsToSchemaAsync(schema);

        schema.Fields.Should().Contain(f => f.Name == "Contact.Email" && f.IsReferenceField);
        schema.Fields.Should().Contain(f => f.Name == "Contact.Phone");
    }

    [Fact]
    public async Task ApplyChangesToReferenceEntityFields_Entity_NoOp()
    {
        var schema = new SchemaDefinition { SchemaName = "Person", SchemaType = SchemaType.Entity };
        await _helper.ApplyChangesToReferenceEntityFields(schema);
        _repo.Verify(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 100, ""), Times.Never);
    }

    [Fact]
    public async Task ApplyChangesToReferenceEntityFields_Dto_UpdatesReferencingEntities()
    {
        var dto = new SchemaDefinition { SchemaName = "ContactInfo", SchemaType = SchemaType.Dto };
        var entity = new SchemaDefinition
        {
            ItemId = "e1",
            SchemaName = "Person",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinition { Name = "Contact", Type = "ContactInfo" } }
        };
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 100, ""))
            .ReturnsAsync(new List<SchemaDefinition> { entity });
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        await _helper.ApplyChangesToReferenceEntityFields(dto);

        _repo.Verify(r => r.UpdateAsync(It.Is<SchemaDefinition>(s => s.ItemId == "e1"), ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("e1", SchemaChangeType.SchemaFieldUpdate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ApplyChangesToReferenceEntityFields_PropagatesRequiredOnToEntity()
    {
        var dto = new SchemaDefinition
        {
            SchemaName = "Address",
            SchemaType = SchemaType.Dto,
            Fields = new()
            {
                new FieldDefinition
                {
                    Name = "HouseNo",
                    Type = "Int",
                    RequiredOn = RequiredOn.Both,
                    IsPIIData = true,
                    IsUniqueData = true
                }
            }
        };
        var entity = new SchemaDefinition
        {
            ItemId = "entity-1",
            SchemaName = "Domain",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinition { Name = "Address", Type = "Address" },
                new FieldDefinition
                {
                    Name = "Address.HouseNo",
                    Type = "String",
                    RequiredOn = RequiredOn.None,
                    IsReferenceField = true
                }
            }
        };

        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(
                It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 100, ""))
            .ReturnsAsync(new List<SchemaDefinition> { entity });
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(
                It.IsAny<FilterDefinition<SchemaDefinition>>(), ""))
            .ReturnsAsync(dto);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), ""))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });

        await _helper.ApplyChangesToReferenceEntityFields(dto);

        _repo.Verify(r => r.UpdateAsync(
            It.Is<SchemaDefinition>(updated => updated.Fields.Any(field =>
                field.Name == "Address.HouseNo" &&
                field.Type == "Int" &&
                field.RequiredOn == RequiredOn.Both &&
                field.IsPIIData &&
                field.IsUniqueData)), ""), Times.Once);
    }

    [Fact]
    public async Task MapDtoSchemasReferencesToResponse_NoDtos_NoOp()
    {
        var items = new List<SchemaDefinitionResponse> { new() { SchemaName = "Person", SchemaType = SchemaType.Entity } };
        await _helper.MapDtoSchemasReferencesToResponse(items);
        items[0].TotalSchemaReferences.Should().Be(0);
    }

    [Fact]
    public async Task MapDtoSchemasReferencesToResponse_SetsReferences()
    {
        var items = new List<SchemaDefinitionResponse> { new() { SchemaName = "ContactInfo", SchemaType = SchemaType.Dto } };
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 100, ""))
            .ReturnsAsync(new List<SchemaDefinition>
            {
                new() { SchemaName = "Person", Fields = new() { new FieldDefinition { Name = "Contact", Type = "ContactInfo" } } }
            });

        await _helper.MapDtoSchemasReferencesToResponse(items);

        items[0].SchemaReferences.Should().Contain("Person");
        items[0].TotalSchemaReferences.Should().Be(1);
    }
}
