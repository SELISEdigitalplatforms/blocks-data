using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Spec #417 §6.1: a schema write is rejected when its CollectionName is used by another tenant Entity schema
/// (not a system entity, not soft-deleted), compared case-insensitively after trimming. Mocked repository:
/// messages, check order, the update skip, and the read budget (C12).
/// </summary>
[Collection("ContextSerial")]
public class SchemaCollectionNameConflictTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly SchemaDefinitionService _service;
    private readonly List<FilterDefinition<BsonDocument>> _conflictReads = [];

    public SchemaCollectionNameConflictTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaDefinitionRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaDefinitionRequest>())).ReturnsAsync(new ValidationResult());
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, It.IsAny<int>(), ""))
            .ReturnsAsync(new List<SchemaDefinition>());
        GivenConflictReadReturns();
        _repo.Setup(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync((SchemaDefinition s, string _) => s);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        var indexes = new Mock<ISchemaIndexService>();
        indexes.Setup(i => i.GetIndexesAsync(It.IsAny<string>()))
            .ReturnsAsync(new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse()));
        _service = new SchemaDefinitionService(_repo.Object, _validator.Object, _changeLog.Object,
            new SchemaDefinitionReferenceHelper(_repo.Object, _changeLog.Object), indexes.Object, NullLogger<SchemaDefinitionService>.Instance);
    }

    /// <summary>The new check is the only read with limit 0 (no cap); it returns <paramref name="schemas"/>.</summary>
    private void GivenConflictReadReturns(params SchemaDefinition[] schemas) =>
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition>(It.IsAny<FilterDefinition<BsonDocument>>(), null, null, 0, 0, ""))
            .Callback((FilterDefinition<BsonDocument> f, SortDefinition<BsonDocument>? _, ProjectionDefinition<BsonDocument>? _, int _, int _, string _) => _conflictReads.Add(f))
            .ReturnsAsync(schemas.ToList());

    private static SchemaDefinition Entity(string id, string name, string collection) =>
        new() { ItemId = id, SchemaName = name, CollectionName = collection, SchemaType = SchemaType.Entity };

    private void GivenStored(SchemaDefinition schema) =>
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(schema.ItemId, "")).ReturnsAsync(schema);

    private static BsonDocument Render(FilterDefinition<BsonDocument> filter) =>
        filter.Render(new RenderArgs<BsonDocument>(BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(), BsonSerializer.SerializerRegistry));

    private int Reads() => _repo.Invocations.Count(i => i.Method.Name.StartsWith("Get", StringComparison.Ordinal));

    [Fact]
    public async Task Create_CollectionNameUsedByAnotherSchema_Returns400_AndWritesNothing()
    {
        // E1 / C1
        GivenConflictReadReturns(Entity("o1", "Order", "sb_Orders"));

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Purchase", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeFalse();
        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Collection name 'sb_Orders' is already used by schema 'Order'");
        result.Data.Should().BeNull();
        result.Errors.Should().BeNull();
        _repo.Verify(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task Create_CollectionNameDifferingByCaseAndWhitespace_Returns400_WithTheRequestedName()
    {
        // E2: the message names the requested value as sent.
        GivenConflictReadReturns(Entity("o1", "Order", "sb_Orders"));

        var result = await _service.CreateSchemaDefinitionAsync(new CreateSchemaDefinitionRequest { SchemaName = "Purchase", CollectionName = " SB_orders ", SchemaType = SchemaType.Entity });

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Collection name ' SB_orders ' is already used by schema 'Order'");
        _repo.Verify(r => r.InsertAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task Create_SeveralConflictingSchemas_NamesTheFirstInOrdinalOrder()
    {
        GivenConflictReadReturns(Entity("c2", "currency", "blx_Currencys"), Entity("c1", "Currency", "blx_Currencys"));

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Money", CollectionName = "blx_Currencys", SchemaType = SchemaType.Entity });

        result.Message.Should().Be("Collection name 'blx_Currencys' is already used by schema 'Currency'");
    }

    [Fact]
    public async Task Create_ReadIsTenantScoped_CaseInsensitive_AndSkipsSystemAndDeleted()
    {
        await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Purchase", CollectionName = " sb_Orders ", SchemaType = SchemaType.Entity });

        var filter = Render(_conflictReads.Should().ContainSingle().Subject);
        filter["SchemaType"].Should().Be(new BsonInt32(1));
        filter["IsSystemEntity"].Should().Be(new BsonDocument("$ne", true));
        // C5: a missing IsDeleted counts as not deleted.
        filter["IsDeleted"].Should().Be(new BsonDocument("$ne", true));
        var regex = filter["CollectionName"].AsBsonRegularExpression;
        regex.Options.Should().Be("i");
        regex.Pattern.Should().Be(@"^\s*sb_Orders\s*$");
        filter.Contains("_id").Should().BeFalse("a create has no own id to exclude");
    }

    [Fact]
    public async Task Create_ReturnedSchemaOutsideTheRule_IsNotAConflict()
    {
        // C4: system and soft-deleted schemas never conflict, even if a read returned them.
        GivenConflictReadReturns(
            new SchemaDefinition { ItemId = "s1", SchemaName = "User", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity, IsSystemEntity = true },
            new SchemaDefinition { ItemId = "d1", SchemaName = "Old", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity, IsDeleted = true },
            new SchemaDefinition { ItemId = "t1", SchemaName = "OrderType", CollectionName = "sb_Orders", SchemaType = SchemaType.Dto });

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Purchase", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task Create_UnusedCollectionName_Inserts_WithOneAdditionalRead()
    {
        // H1 / C12: the three existing checks read once each; the new check adds exactly one read.
        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
        _repo.Verify(r => r.InsertAsync(It.Is<SchemaDefinition>(s => s.CollectionName == "Persons"), ""), Times.Once);
        _conflictReads.Should().ContainSingle();
        Reads().Should().Be(4);
    }

    [Fact]
    public async Task Create_NonEntitySchema_HasNoCollectionCheck()
    {
        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Address", CollectionName = "", SchemaType = SchemaType.Dto });

        result.IsSuccess.Should().BeTrue();
        _conflictReads.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_ExistingChecksKeepPriority_OverTheCollectionConflict()
    {
        GivenConflictReadReturns(Entity("o1", "Order", "sb_Orders"));
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "x" });

        var result = await _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Order", CollectionName = "sb_Orders", SchemaType = SchemaType.Entity });

        result.Message.Should().Be("Schema with the same name already exists");
        _conflictReads.Should().BeEmpty();
    }

    [Theory]
    [InlineData("info")]
    [InlineData("define")]
    public async Task Update_ResendingTheStoredCollectionName_SkipsTheCheck(string endpoint)
    {
        // E3 / H5: an already-duplicated schema stays editable.
        GivenStored(Entity("legacy", "CurrencyLegacy", "blx_Currencys"));
        GivenConflictReadReturns(Entity("cur", "Currency", "blx_Currencys"));

        var result = endpoint == "info"
            ? await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "legacy", SchemaName = "CurrencyLegacy", CollectionName = "blx_Currencys", SchemaType = SchemaType.Entity, Description = "new" })
            : await _service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest { ItemId = "legacy", SchemaName = "CurrencyLegacy", CollectionName = "blx_Currencys", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
        _conflictReads.Should().BeEmpty("C12: an unchanged collection name costs no additional read");
    }

    [Theory]
    [InlineData("info")]
    [InlineData("define")]
    public async Task Update_ChangingToAConflictingCollectionName_Returns400_AndLeavesTheSchemaUnchanged(string endpoint)
    {
        // C2
        GivenStored(Entity("p1", "Purchase", "sb_Purchases"));
        GivenConflictReadReturns(Entity("o1", "Order", "sb_Orders"));

        var result = endpoint == "info"
            ? await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "p1", SchemaName = "Purchase", CollectionName = "sb_orders", SchemaType = SchemaType.Entity })
            : await _service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest { ItemId = "p1", SchemaName = "Purchase", CollectionName = "sb_orders", SchemaType = SchemaType.Entity });

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Collection name 'sb_orders' is already used by schema 'Order'");
        _repo.Verify(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), ""), Times.Never);
    }

    [Fact]
    public async Task Update_ChangingCase_ExcludesItsOwnIdInsideTheQuery()
    {
        // C3: the own id is excluded in the query, and also in memory if a read returned it anyway.
        GivenStored(Entity("p1", "Purchase", "sb_Purchases"));
        GivenConflictReadReturns(Entity("p1", "Purchase", "sb_Purchases"));

        var result = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "p1", SchemaName = "Purchase", CollectionName = "SB_Purchases", SchemaType = SchemaType.Entity });

        result.IsSuccess.Should().BeTrue();
        Render(_conflictReads.Should().ContainSingle().Subject)["_id"].Should().Be(new BsonDocument("$ne", "p1"));
    }
}

/// <summary>Spec #417 C1, C3, C4, C5 against real MongoDB: the conflict read's filter as the database applies it.</summary>
[Collection("Mongo")]
public class SchemaCollectionNameConflictMongoTests
{
    private readonly IMongoDatabase _db;
    private readonly SchemaDefinitionService _service;

    public SchemaCollectionNameConflictMongoTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);
        var repository = new DbRepository(contextProvider.Object, Mock.Of<IBlocksSecret>());
        var validator = new Mock<IRequestValidator>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(new ValidationResult());
        var changeLog = new Mock<ISchemaChangeLogService>();
        var indexes = new Mock<ISchemaIndexService>();
        indexes.Setup(i => i.GetIndexesAsync(It.IsAny<string>()))
            .ReturnsAsync(new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse()));
        _service = new SchemaDefinitionService(repository, validator.Object, changeLog.Object,
            new SchemaDefinitionReferenceHelper(repository, changeLog.Object), indexes.Object, NullLogger<SchemaDefinitionService>.Instance);
    }

    private IMongoCollection<SchemaDefinition> Schemas => _db.GetCollection<SchemaDefinition>("SchemaDefinitions");

    private async Task SeedAsync(SchemaDefinition schema, bool withoutIsDeleted = false)
    {
        await Schemas.InsertOneAsync(schema);
        if (withoutIsDeleted)
            await _db.GetCollection<BsonDocument>("SchemaDefinitions").UpdateOneAsync(
                new BsonDocument("_id", schema.ItemId), new BsonDocument("$unset", new BsonDocument("IsDeleted", "")));
    }

    private static SchemaDefinition Entity(string id, string name, string collection) =>
        new() { ItemId = id, SchemaName = name, CollectionName = collection, SchemaType = SchemaType.Entity };

    private Task<ServiceResponse<ActionResponse>> CreateAsync(string name, string collection)
    {
        BlocksTestContext.Set();
        return _service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = name, CollectionName = collection, SchemaType = SchemaType.Entity });
    }

    [Fact]
    public async Task Create_ConflictCaseInsensitiveAfterTrimming_WithStoredDocumentWithoutIsDeleted_Returns400()
    {
        // C1 + C5: the stored schema has no IsDeleted field and surrounding whitespace in its collection name.
        await SeedAsync(Entity("o1", "Order", " sb_Orders "), withoutIsDeleted: true);

        var result = await CreateAsync("Purchase", "SB_orders");

        result.HttpStatusCode.Should().Be(400);
        result.Message.Should().Be("Collection name 'SB_orders' is already used by schema 'Order'");
        (await Schemas.CountDocumentsAsync(FilterDefinition<SchemaDefinition>.Empty)).Should().Be(1);
    }

    [Fact]
    public async Task Create_OnlySystemOrSoftDeletedOwners_Succeeds()
    {
        // C4
        await SeedAsync(new SchemaDefinition { ItemId = "s1", SchemaName = "Ledger", CollectionName = "sb_Ledgers", SchemaType = SchemaType.Entity, IsSystemEntity = false, IsDeleted = true });
        await SeedAsync(new SchemaDefinition { ItemId = "s2", SchemaName = "Audit", CollectionName = "sb_Audits", SchemaType = SchemaType.Entity, IsSystemEntity = true });

        (await CreateAsync("Book", "sb_Ledgers")).IsSuccess.Should().BeTrue();
        // A system entity's collection stays reserved by the existing rule, not by the new one.
        (await CreateAsync("Trail", "sb_Audits")).Message.Should().Be("Collection name 'sb_Audits' is reserved by a system entity");
    }

    [Fact]
    public async Task Update_OwnSchemaAndOlderDuplicate_ChangingCaseConflictsOnlyWithTheOther()
    {
        // C3: the schema being updated never conflicts with itself; another schema with that collection does.
        await SeedAsync(Entity("p1", "Purchase", "sb_Purchases"));

        BlocksTestContext.Set();
        var own = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "p1", SchemaName = "Purchase", CollectionName = "SB_Purchases", SchemaType = SchemaType.Entity });
        own.IsSuccess.Should().BeTrue();

        await SeedAsync(Entity("p0", "PurchaseOld", "sb_purchases"));
        var other = await _service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "p1", SchemaName = "Purchase", CollectionName = "sb_Purchases", SchemaType = SchemaType.Entity });
        other.HttpStatusCode.Should().Be(400);
        other.Message.Should().Be("Collection name 'sb_Purchases' is already used by schema 'PurchaseOld'");
        (await Schemas.Find(s => s.ItemId == "p1").SingleAsync()).CollectionName.Should().Be("SB_Purchases");
    }
}

/// <summary>Spec #417 §6.1 import rule against real MongoDB: the validator's single conflict read as the database applies it.</summary>
[Collection("Mongo")]
public class SchemaImportCollectionNameMongoTests
{
    private readonly IMongoDatabase _db;
    private readonly SchemaImportValidator _validator;

    public SchemaImportCollectionNameMongoTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);
        _validator = new SchemaImportValidator(new DbRepository(contextProvider.Object, Mock.Of<IBlocksSecret>()));
    }

    private static SchemaExportDocument EntityDoc(string name, string collection) => new()
    {
        SchemaName = name, CollectionName = collection, SchemaType = SchemaType.Entity,
        Fields = [new ExportFieldDefinition { Name = "Title", Type = "String" }]
    };

    [Fact]
    public async Task Validate_ChecksOnlyInsertingDocuments_AgainstNonDeletedEntityOwners()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([
            new SchemaDefinition { ItemId = "o1", SchemaName = "Order", CollectionName = " sb_Orders ", SchemaType = SchemaType.Entity },
            // Soft-deleted: still matched by name (so "Archive" is an update, not checked), never an owner.
            new SchemaDefinition { ItemId = "a1", SchemaName = "Archive", CollectionName = "sb_Archives", SchemaType = SchemaType.Entity, IsDeleted = true },
        ]);

        var errors = await _validator.ValidateAsync(
            [EntityDoc("Invoice", "SB_orders"), EntityDoc("Archive", "sb_Orders"), EntityDoc("Box", "sb_Archives")], "tenant-1");

        errors.Should().Equal("Document[0]: CollectionName 'SB_orders' is already used by schema 'Order'.");
    }
}
