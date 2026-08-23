using DataGateway.DomainService.Entities;
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

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class SchemaDefinitionServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<IProjectService> _project = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
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
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync((SchemaDefinition s, string _) => s);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        _refHelper = new SchemaDefinitionReferenceHelper(_repo.Object, _changeLog.Object);
        _service = new SchemaDefinitionService(_repo.Object, _validator.Object, _project.Object, _changeLog.Object, _refHelper, NullLogger<SchemaDefinitionService>.Instance);
    }

    private void NameIsUnique() => _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
    private void NameExists() => _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition());

    [Fact]
    public void Constructor_NullArgs_Throw()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionService(null!, _validator.Object, _project.Object, _changeLog.Object, _refHelper, NullLogger<SchemaDefinitionService>.Instance));
        Assert.Throws<ArgumentNullException>(() => new SchemaDefinitionService(_repo.Object, _validator.Object, null!, _changeLog.Object, _refHelper, NullLogger<SchemaDefinitionService>.Instance));
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
    public async Task UpdateSchema_NotFound_Returns204()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "x", SchemaName = "P", CollectionName = "Ps", SchemaType = SchemaType.Entity });
        result.HttpStatusCode.Should().Be(204);
    }

    [Fact]
    public async Task UpdateSchema_InvalidName_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1" });
        NameIsUnique(); // name does NOT already exist -> update treats as invalid
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "P", CollectionName = "Ps", SchemaType = SchemaType.Entity });
        result.Message.Should().Be("Invalid schema name");
    }

    [Fact]
    public async Task UpdateSchema_Valid_Updates()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1" });
        NameExists();
        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "1", SchemaName = "P", CollectionName = "Ps", SchemaType = SchemaType.Entity });
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
    public async Task UpdateSchemaDefinition_Valid_Updates()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "1" });
        NameExists();
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
