using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using SortDirection = DataGateway.DomainService.Models.SortDirection;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Validation/business-rule paths for SchemaIndexService using a mocked IDbRepository.
/// Real MongoDB index creation, uniqueness enforcement, and field-order preservation are
/// covered separately against a real (ephemeral) Mongo instance, since a mock can't prove those.
/// </summary>
[Collection("ContextSerial")]
public class SchemaIndexServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly SchemaIndexService _service;

    public SchemaIndexServiceTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaIndexRequest>())).ReturnsAsync(new ValidationResult());
        _repo.Setup(r => r.GetItemsAsync<SchemaIndexDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaIndexDefinition>());
        _service = new SchemaIndexService(_repo.Object, _validator.Object, _changeLog.Object);
    }

    private static SchemaDefinition EntitySchema(string itemId = "schema-1", string collectionName = "Customers") => new()
    {
        ItemId = itemId,
        SchemaType = SchemaType.Entity,
        CollectionName = collectionName,
        Fields = new()
        {
            new FieldDefinition { Name = "email", Type = "String" },
            new FieldDefinition { Name = "lastName", Type = "String" },
            new FieldDefinition { Name = "age", Type = "Int" },
            new FieldDefinition { Name = "tags", Type = "String", IsArray = true },
            new FieldDefinition { Name = "manager", Type = "Person", IsReferenceField = true },
        }
    };

    [Fact]
    public async Task CreateIndex_SchemaNotFound_Returns404()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("missing", "")).ReturnsAsync((SchemaDefinition?)null);

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "missing",
            Fields = new() { new IndexFieldRequest { FieldName = "email" } }
        });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(404);
        result.Message.Should().Be("SCHEMA_NOT_FOUND");
    }

    [Fact]
    public async Task CreateIndex_DtoSchema_Returns400()
    {
        var schema = EntitySchema();
        schema.SchemaType = SchemaType.Dto;
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(schema);

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = "email" } }
        });

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("SCHEMA_TYPE_NOT_INDEXABLE");
    }

    [Theory]
    [InlineData("doesNotExist")]
    [InlineData("manager")]
    public async Task CreateIndex_IneligibleField_Returns400(string fieldName)
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = fieldName } }
        });

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().StartWith("FIELD_NOT_INDEXABLE");
    }

    [Fact]
    public async Task CreateIndex_ArrayField_IsEligible()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        _repo.Setup(r => r.CreateIndexAsync("Customers", It.IsAny<List<(string, int)>>(), false, "tags_1", ""))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaIndexDefinition>(), ""))
            .ReturnsAsync((SchemaIndexDefinition d, string _) => { d.ItemId = "idx-1"; return d; });

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = "tags" } }
        });

        result.IsSuccess.Should().BeTrue("array (multikey) fields are explicitly eligible for indexing");
        result.Data!.ItemId.Should().Be("idx-1");
    }

    [Fact]
    public async Task CreateIndex_IndexLimitReached_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        var fifteenIndexes = Enumerable.Range(0, 15)
            .Select(i => new SchemaIndexDefinition { Name = $"idx_{i}", SchemaDefinitionItemId = "schema-1" })
            .ToList();
        _repo.Setup(r => r.GetItemsAsync<SchemaIndexDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(fifteenIndexes);

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = "email" } }
        });

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("INDEX_LIMIT_REACHED");
    }

    [Fact]
    public async Task CreateIndex_DuplicateCombination_Returns409()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        _repo.Setup(r => r.GetItemsAsync<SchemaIndexDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaIndexDefinition> { new() { Name = "email_1", SchemaDefinitionItemId = "schema-1" } });

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = "email", Direction = SortDirection.ASC } }
        });

        result.HttpStatusCode.Should().Be(409);
        result.Message.Should().Be("INDEX_ALREADY_EXISTS");
    }

    [Fact]
    public async Task CreateIndex_Compound_BuildsOrderedKeysAndName()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        List<(string FieldName, int Direction)>? capturedKeys = null;
        _repo.Setup(r => r.CreateIndexAsync("Customers", It.IsAny<List<(string, int)>>(), true, "lastName_1_age_-1", ""))
            .Callback<string, List<(string, int)>, bool, string, string>((_, keys, _, _, _) => capturedKeys = keys)
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaIndexDefinition>(), ""))
            .ReturnsAsync((SchemaIndexDefinition d, string _) => { d.ItemId = "idx-1"; return d; });

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            IsUnique = true,
            Fields = new()
            {
                new IndexFieldRequest { FieldName = "lastName", Direction = SortDirection.ASC },
                new IndexFieldRequest { FieldName = "age", Direction = SortDirection.DESC },
            }
        });

        result.IsSuccess.Should().BeTrue();
        capturedKeys.Should().Equal(("lastName", 1), ("age", -1));
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("schema-1", SchemaChangeType.SchemaIndexCreate), Times.Once);
    }

    [Fact]
    public async Task CreateIndex_MongoDuplicateKeyOnUniqueBuild_Returns409AndPersistsNothing()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        _repo.Setup(r => r.CreateIndexAsync("Customers", It.IsAny<List<(string, int)>>(), true, "email_1", ""))
            .ThrowsAsync(new MongoCommandException(
                new MongoDB.Driver.Core.Connections.ConnectionId(new MongoDB.Driver.Core.Servers.ServerId(new MongoDB.Driver.Core.Clusters.ClusterId(), new System.Net.DnsEndPoint("localhost", 27017))),
                "E11000 duplicate key error collection",
                new BsonDocument(),
                new BsonDocument("code", 11000)));

        var result = await _service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            IsUnique = true,
            Fields = new() { new IndexFieldRequest { FieldName = "email" } }
        });

        result.HttpStatusCode.Should().Be(409);
        result.Message.Should().Be("UNIQUE_INDEX_CONFLICT");
        _repo.Verify(r => r.InsertAsync(It.IsAny<SchemaIndexDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task GetIndexes_SchemaNotFound_Returns404()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("missing", "")).ReturnsAsync((SchemaDefinition?)null);

        var result = await _service.GetIndexesAsync("missing");

        result.HttpStatusCode.Should().Be(404);
    }

    [Fact]
    public async Task GetIndexes_NoIndexes_ReturnsEmptyList()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());

        var result = await _service.GetIndexesAsync("schema-1");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Indexes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetIndexes_WithExistingIndexes_MapsEveryFieldOfTheResponse()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        var created = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        _repo.Setup(r => r.GetItemsAsync<SchemaIndexDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<SchemaIndexDefinition>
            {
                new()
                {
                    ItemId = "idx-1",
                    Name = "lastName_1_age_-1",
                    IsUnique = true,
                    CreatedDate = created,
                    Fields = new()
                    {
                        new IndexFieldSpec { FieldName = "lastName", Direction = 1 },
                        new IndexFieldSpec { FieldName = "age", Direction = -1 },
                    }
                }
            });

        var result = await _service.GetIndexesAsync("schema-1");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Indexes.Should().ContainSingle();
        var index = result.Data!.Indexes[0];
        index.ItemId.Should().Be("idx-1");
        index.Name.Should().Be("lastName_1_age_-1");
        index.IsUnique.Should().BeTrue();
        index.CreatedDate.Should().Be(created);
        index.Fields.Should().BeEquivalentTo(new[]
        {
            new IndexFieldResponse { FieldName = "lastName", Direction = SortDirection.ASC },
            new IndexFieldResponse { FieldName = "age", Direction = SortDirection.DESC }
        }, options => options.WithStrictOrdering());
    }

    [Fact]
    public async Task DeleteIndex_NotFound_Returns404()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaIndexDefinition>("missing", "")).ReturnsAsync((SchemaIndexDefinition?)null);

        var result = await _service.DeleteIndexAsync("missing");

        result.HttpStatusCode.Should().Be(404);
        result.Message.Should().Be("INDEX_NOT_FOUND");
    }

    [Fact]
    public async Task DeleteIndex_Existing_DropsMongoIndexAndDeletesMetadata()
    {
        var index = new SchemaIndexDefinition { ItemId = "idx-1", SchemaDefinitionItemId = "schema-1", Name = "email_1" };
        _repo.Setup(r => r.GetItemAsync<SchemaIndexDefinition>("idx-1", "")).ReturnsAsync(index);
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>("schema-1", "")).ReturnsAsync(EntitySchema());
        _repo.Setup(r => r.DropIndexAsync("Customers", "email_1", "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.DeleteAsync(It.IsAny<FilterDefinition<SchemaIndexDefinition>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        var result = await _service.DeleteIndexAsync("idx-1");

        result.IsSuccess.Should().BeTrue();
        _repo.Verify(r => r.DropIndexAsync("Customers", "email_1", ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("schema-1", SchemaChangeType.SchemaIndexDelete), Times.Once);
    }
}
