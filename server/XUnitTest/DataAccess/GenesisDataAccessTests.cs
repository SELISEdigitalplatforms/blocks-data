using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataAccess;

/// <summary>
/// The gateway and the Genesis data-access engine read the same tenant rows. System entities stay out of
/// GraphQL, and for every other schema the engine's loader assembles exactly what the GraphQL build assembles.
/// </summary>
[Collection("Mongo")]
public class GenesisDataAccessTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly GraphqlSchemaBuilder _builder;
    private readonly DbRepository _repository;
    private readonly DataAccessResolver _resolver;
    private readonly AccessPrincipal _principal = new("user-1", "user@x.com", Tenant, "org-1", [], [], true, false) { HasContext = true };

    public GenesisDataAccessTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase(Tenant)).Returns(_db);
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);
        var repository = _repository = new DbRepository(contextProvider.Object, Mock.Of<IBlocksSecret>());
        _builder = new GraphqlSchemaBuilder(
            new SchemaResolver(Mock.Of<IMutationService>(), Mock.Of<IQueryService>()), repository, NullLogger<GraphqlSchemaBuilder>.Instance);
        var principals = new Mock<IAccessPrincipalAccessor>();
        principals.Setup(p => p.Current).Returns(_principal);
        _resolver = new DataAccessResolver(contextProvider.Object, new DataAccessPolicyResolutionService(new SchemaPolicySource()), principals.Object);
    }

    private async Task SeedAsync()
    {
        var order = new SchemaDefinition
        {
            ItemId = "sch-order",
            SchemaName = "Order",
            ReadAccessLevel = SchemaAccessLevel.Custom,
            EditAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Status", Type = "String" }, new FieldDefinition { Name = "CreatedBy", Type = "String" }]
        };
        var systemUser = new SchemaDefinition
        {
            ItemId = "sch-system-user",
            SchemaName = "User",
            CollectionName = "Users",
            IsSystemEntity = true,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Roles", Type = "Json" }]
        };
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([order, systemUser]);

        var owner = Policy(PolicyType.RLS, PolicyOperation.READ, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId")));
        owner.ItemId = "pol-owner";
        owner.SchemaId = order.ItemId;
        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertOneAsync(owner);
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(
            new DataValidation { ItemId = "val-1", SchemaId = order.ItemId, FieldName = "Status" });
    }

    [Fact]
    public async Task ReadDraftSourceAsync_LeavesSystemEntitiesOutOfGraphQl()
    {
        await SeedAsync();

        var source = await _builder.ReadDraftSourceAsync(Tenant);

        source.SchemaDefinitions.Select(s => s.SchemaName).Should().Equal("Order");
    }

    [Fact]
    public async Task SystemEntity_IsStillResolvableByTheEngine()
    {
        await SeedAsync();

        var schema = await _resolver.LoadSchemaAsync("User", _principal);

        schema.Should().NotBeNull();
        schema!.IsSystemEntity.Should().BeTrue();
        (await _resolver.ResolveReadFilterAsync("User", new MongoDB.Bson.BsonDocument())).IsAccessGranted
            .Should().BeFalse("Custom read with no policy denies, so a seeded system entity is closed until policies exist");
    }

    [Fact]
    public async Task LoadSchemaAsync_MatchesGatewayAssemble_ForTheSameRows()
    {
        await SeedAsync();
        var expected = GraphqlSchemaBuilder.Assemble(await _builder.ReadDraftSourceAsync(Tenant)).Single(s => s.SchemaName == "Order");

        var actual = await _resolver.LoadSchemaAsync("Order", _principal);

        // Column clones get a fresh ItemId, timestamps and an audit stamp on every assembly (the gateway stamps
        // from the ambient context, the loader from the principal); none of that is evaluated. Everything else must match.
        actual.Should().BeEquivalentTo(expected, o => o
            .Excluding(ctx => ctx.Path.StartsWith("Policies") && (
                ctx.Path.EndsWith("ItemId") || ctx.Path.EndsWith("CreatedBy") || ctx.Path.EndsWith("LastUpdatedBy") || ctx.Path.EndsWith("OrganizationId")))
            .Excluding(ctx => ctx.Path.EndsWith("CreatedDate"))
            .Excluding(ctx => ctx.Path.EndsWith("LastUpdatedDate")));
    }

    // ---- Tenant API isolation from system entities (owner decision 2026-10-14) ----

    private SchemaDefinitionService NewSchemaService()
    {
        BlocksTestContext.Set();
        var validator = new Mock<IRequestValidator>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaDefinitionRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateSchemaDefinitionRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<SaveFieldDefinitionRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        var changeLog = new Mock<ISchemaChangeLogService>();
        var indexes = new Mock<ISchemaIndexService>();
        indexes.Setup(i => i.GetIndexesAsync(It.IsAny<string>()))
            .ReturnsAsync(new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse()));
        return new SchemaDefinitionService(_repository, validator.Object, Mock.Of<IProjectService>(), changeLog.Object,
            new SchemaDefinitionReferenceHelper(_repository, changeLog.Object), indexes.Object, NullLogger<SchemaDefinitionService>.Instance);
    }

    private async Task SeedSystemSchemasAsync()
    {
        var file = new SchemaDefinition
        {
            ItemId = "sch-system-file", SchemaName = "File", CollectionName = "Files", IsSystemEntity = true,
            ReadAccessLevel = SchemaAccessLevel.Custom, Fields = [new FieldDefinition { Name = "Name", Type = "String" }]
        };
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(file);
        var systemPolicy = Policy(PolicyType.RLS, PolicyOperation.READ, [],
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "Email", PolicyOperator.EQUAL, ConditionSource.AUTH, "email")));
        systemPolicy.ItemId = "pol-system-user";
        systemPolicy.SchemaId = "sch-system-user";
        systemPolicy.SchemaName = "User";
        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertOneAsync(systemPolicy);
    }

    private static CreateSchemaDefinitionRequest NewDefinition(string name) => new()
    {
        SchemaName = name, CollectionName = name + "s", SchemaType = SchemaType.Entity,
        Fields = [new FieldDefinitionRequest { Name = "Title", Type = "String" }]
    };

    private async Task<SchemaDefinition> StoredAsync(string itemId) =>
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").Find(s => s.ItemId == itemId).SingleAsync();

    [Fact]
    public async Task TenantCanCreateSchemasNamedLikeSystemEntities()
    {
        await SeedAsync();
        await SeedSystemSchemasAsync();
        var service = NewSchemaService();

        // "User" is a system entity; "FileResult" collides with the generated type of system "File".
        foreach (var name in new[] { "User", "FileResult" })
        {
            var result = await service.CreateSchemaDefinitionAsync(NewDefinition(name));
            result.IsSuccess.Should().BeTrue(name);
        }

        var simple = await service.CreateSchemaAsync(new CreateSchemaRequest { SchemaName = "Role", CollectionName = "Roles", SchemaType = SchemaType.Entity });
        simple.IsSuccess.Should().BeTrue();
        (await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").CountDocumentsAsync(s => s.SchemaName == "User")).Should().Be(2);
    }

    [Fact]
    public async Task TenantCanCreateSchemaWhoseGeneratedTypeMatchesASystemEntity()
    {
        await SeedAsync();
        var service = NewSchemaService();

        // "UserInput" is the generated input type of system "User".
        (await service.CreateSchemaDefinitionAsync(NewDefinition("UserInput"))).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task TenantCanRenameSchemaToSystemEntityName()
    {
        await SeedAsync();
        var service = NewSchemaService();

        var result = await service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "sch-order", SchemaName = "User", CollectionName = "Orders", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinitionRequest { Name = "Status", Type = "String" }]
        });

        result.IsSuccess.Should().BeTrue();
        (await StoredAsync("sch-order")).SchemaName.Should().Be("User");
    }

    [Fact]
    public async Task NormalSchemaNamesStillCollide()
    {
        await SeedAsync();
        var service = NewSchemaService();

        (await service.CreateSchemaDefinitionAsync(NewDefinition("Order"))).HttpStatusCode.Should().Be(400);
        (await service.CreateSchemaDefinitionAsync(NewDefinition("OrderResult"))).HttpStatusCode.Should().Be(400);
    }

    [Fact]
    public async Task SystemSchema_IsHiddenFromGetByIdInfoAndAggregation()
    {
        await SeedAsync();
        // The aggregation counts Entity schemas only.
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").UpdateManyAsync(
            Builders<SchemaDefinition>.Filter.Empty, Builders<SchemaDefinition>.Update.Set(s => s.SchemaType, SchemaType.Entity));
        var service = NewSchemaService();

        (await service.GetSchemaByIdAsync("sch-system-user")).HttpStatusCode.Should().Be(204);
        (await service.GetSchemaByIdAsync("sch-order")).IsSuccess.Should().BeTrue();

        (await service.GetEntityCollectionByNameAsync("User")).HttpStatusCode.Should().Be(404);
        var collections = await service.GetEntityCollectionsAsync();
        collections.Data!.Collections.Select(c => c.CollectionName).Should().NotContain("Users");

        // Order is Custom on read and edit; the system "User" (Custom read) must not be counted.
        var aggregation = (await service.GetSchemaAggregationAsync()).Data!;
        aggregation.Read.Custom.Should().Be(1);
        aggregation.Edit.Custom.Should().Be(1);
    }

    [Fact]
    public async Task GetById_OfTenantSchemaSharingASystemName_DoesNotReturnSystemPolicies()
    {
        await SeedAsync();
        await SeedSystemSchemasAsync();
        var service = NewSchemaService();
        var created = await service.CreateSchemaDefinitionAsync(NewDefinition("User"));

        var response = (await service.GetSchemaByIdAsync(created.Data!.ItemId)).Data!;

        response.ReadPolicies.Should().BeEmpty();
    }

    [Fact]
    public async Task SystemSchema_CannotBeUpdatedOrDeleted()
    {
        await SeedAsync();
        var service = NewSchemaService();

        (await service.UpdateSchemaAsync(new UpdateSchemaRequest { ItemId = "sch-system-user", SchemaName = "Renamed", CollectionName = "Users", SchemaType = SchemaType.Entity }))
            .HttpStatusCode.Should().Be(204);
        (await service.UpdateSchemaDefinitionAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "sch-system-user", SchemaName = "Renamed", CollectionName = "Users", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinitionRequest { Name = "Evil", Type = "String" }]
        })).HttpStatusCode.Should().Be(204);
        (await service.SaveFieldDefinitionAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "sch-system-user", Fields = [new FieldDefinitionRequest { Name = "Evil", Type = "String" }]
        })).HttpStatusCode.Should().Be(204);
        (await service.DeleteSchemaAsync("sch-system-user")).HttpStatusCode.Should().Be(204);

        var stored = await StoredAsync("sch-system-user");
        stored.SchemaName.Should().Be("User");
        stored.IsSystemEntity.Should().BeTrue();
        stored.Fields.Select(f => f.Name).Should().Equal("Email", "Roles");
    }

    [Fact]
    public async Task Import_NeverMatchesOrOverwritesASystemSchema()
    {
        await SeedAsync();
        await SeedSystemSchemasAsync();
        var import = new SchemaImportService(Mock.Of<IMessageClient>(), _repository, NullLogger<SchemaImportService>.Instance, new SchemaImportValidator(_repository));
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "User", CollectionName = "TenantUsers", SchemaType = SchemaType.Entity,
                Fields = [new ExportFieldDefinition { Name = "Nick", Type = "String" }],
                RowLevelPolicies = [new ExportAccessPolicy { PolicyName = "tenant-own", Operation = PolicyOperation.READ, IsAllowPolicy = true }]
            }
        };

        var count = await import.ProcessImportAsync(new SchemaImportEvent { FileId = "f", ProjectKey = Tenant },
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(docs));

        count.Should().Be(1);
        var system = await StoredAsync("sch-system-user");
        system.CollectionName.Should().Be("Users");
        system.Fields.Select(f => f.Name).Should().Equal("Email", "Roles");
        var users = await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").Find(s => s.SchemaName == "User").ToListAsync();
        users.Should().HaveCount(2);
        users.Single(s => !s.IsSystemEntity).CollectionName.Should().Be("TenantUsers");
    }

    [Fact]
    public async Task Import_KeepsPoliciesOfASystemSchemaWithTheSameName()
    {
        await SeedAsync();
        await SeedSystemSchemasAsync();
        var import = new SchemaImportService(Mock.Of<IMessageClient>(), _repository, NullLogger<SchemaImportService>.Instance, new SchemaImportValidator(_repository));
        var docs = new List<SchemaExportDocument>
        {
            new()
            {
                SchemaName = "User", CollectionName = "TenantUsers", SchemaType = SchemaType.Entity,
                Fields = [new ExportFieldDefinition { Name = "Nick", Type = "String" }],
                RowLevelPolicies = [new ExportAccessPolicy { PolicyName = "tenant-own", Operation = PolicyOperation.READ, IsAllowPolicy = true }]
            }
        };

        await import.ProcessImportAsync(new SchemaImportEvent { FileId = "f", ProjectKey = Tenant },
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(docs));

        var systemPolicies = await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").Find(p => p.SchemaId == "sch-system-user").ToListAsync();
        systemPolicies.Select(p => p.ItemId).Should().Equal("pol-system-user");
    }

    [Fact]
    public async Task ReadDraftSourceAsync_LeavesSystemEntityPoliciesOutOfGraphQl()
    {
        await SeedAsync();
        await SeedSystemSchemasAsync();

        var source = await _builder.ReadDraftSourceAsync(Tenant);

        source.DataAccessPolicies.Select(p => p.ItemId).Should().Equal("pol-owner");
    }

    // ---- Round 2: remaining write paths ----

    private static IRequestValidator ValidAlways()
    {
        var validator = new Mock<IRequestValidator>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<CreateSchemaIndexRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataValidationRequest>())).ReturnsAsync(new FluentValidation.Results.ValidationResult());
        return validator.Object;
    }

    private static async Task<List<string>> FieldNamesAsync(IMongoCollection<SchemaDefinition> c, string id) =>
        (await c.Find(s => s.ItemId == id).SingleAsync()).Fields.Select(f => f.Name).ToList();

    [Fact]
    public async Task ResetSchemaStructure_NeverTouchesSystemSchemas()
    {
        await SeedAsync();
        var schemas = _db.GetCollection<SchemaDefinition>("SchemaDefinitions");
        await schemas.UpdateManyAsync(Builders<SchemaDefinition>.Filter.Empty, Builders<SchemaDefinition>.Update.Set(s => s.SchemaType, SchemaType.Entity));
        var before = (await schemas.Find(s => s.ItemId == "sch-system-user").SingleAsync()).LastUpdatedDate;

        var result = await NewSchemaService().ResetSchemaStructureAsync();

        result.Keys.Should().Contain("Order").And.NotContain("User");
        (await schemas.Find(s => s.ItemId == "sch-system-user").SingleAsync()).LastUpdatedDate.Should().Be(before);
    }

    [Fact]
    public async Task DtoChange_DoesNotRewriteSystemSchemasThatReferenceIt()
    {
        await SeedAsync();
        var schemas = _db.GetCollection<SchemaDefinition>("SchemaDefinitions");
        await schemas.UpdateOneAsync(s => s.ItemId == "sch-system-user",
            Builders<SchemaDefinition>.Update.Set(s => s.SchemaType, SchemaType.Entity).Push(s => s.Fields, new FieldDefinition { Name = "Addr", Type = "Address" }));
        var dto = new SchemaDefinition { ItemId = "sch-dto", SchemaName = "Address", SchemaType = SchemaType.Dto, Fields = [new FieldDefinition { Name = "City", Type = "String" }] };
        var changeLog = new Mock<ISchemaChangeLogService>();
        var helper = new SchemaDefinitionReferenceHelper(_repository, changeLog.Object);

        await helper.ApplyChangesToReferenceEntityFields(dto);

        (await FieldNamesAsync(schemas, "sch-system-user")).Should().Equal("Email", "Roles", "Addr");
        changeLog.Verify(c => c.CreateSchemaChangeLogAsync("sch-system-user", It.IsAny<SchemaChangeType>()), Times.Never);
    }

    [Fact]
    public async Task RealValidators_LetTenantReuseASystemSchemaName_ButNormalNamesStillCollide()
    {
        await SeedAsync();
        var create = new CreateSchemaRequestValidator(_repository);
        (await create.IsValidSchemaName("User")).Should().BeTrue();
        (await create.IsValidSchemaName("Order")).Should().BeFalse();

        var update = new UpdateSchemaDefinitionRequestValidator(_repository);
        var rename = (string name) => new UpdateSchemaDefinitionRequest
        {
            ItemId = "sch-order", SchemaName = name, CollectionName = "Orders", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinitionRequest { Name = "Status", Type = "String" }]
        };
        (await update.ValidateAsync(rename("User"))).Errors.Should().BeEmpty();
        // The system collection name stays reserved.
        var clash = rename("Anything");
        clash.CollectionName = "Users";
        (await update.ValidateAsync(clash)).IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task DataValidations_OfASystemSchema_CannotBeCreatedUpdatedOrDeleted()
    {
        await SeedAsync();
        var changeLog = new Mock<ISchemaChangeLogService>();
        var validator = new CreateDataValidationRequestValidator(_repository);
        var request = new CreateDataValidationRequest
        {
            SchemaId = "sch-system-user", FieldName = "Email",
            Validations = [new ValidationRuleRequest { Type = ValidationType.NotEmpty }]
        };
        (await validator.ValidateAsync(request)).IsValid.Should().BeFalse("the schema is not addressable by a tenant");

        var service = new DataValidationService(_repository, ValidAlways(), changeLog.Object);
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(
            new DataValidation { ItemId = "val-sys", SchemaId = "sch-system-user", FieldName = "Email" });

        (await service.DeleteDataValidationAsync("val-sys")).IsSuccess.Should().BeFalse();
        (await service.UpdateDataValidationAsync(new UpdateDataValidationRequest { ItemId = "val-sys", SchemaId = "sch-order", FieldName = "Status" })).IsSuccess.Should().BeFalse();
        (await _db.GetCollection<DataValidation>("DataValidations").CountDocumentsAsync(v => v.ItemId == "val-sys" && v.SchemaId == "sch-system-user")).Should().Be(1);
    }

    [Fact]
    public async Task Indexes_OfASystemSchema_CannotBeCreatedListedOrDeleted()
    {
        await SeedAsync();
        var changeLog = new Mock<ISchemaChangeLogService>();
        var service = new SchemaIndexService(_repository, ValidAlways(), changeLog.Object);
        await _db.GetCollection<SchemaIndexDefinition>("SchemaIndexDefinitions").InsertOneAsync(
            new SchemaIndexDefinition { ItemId = "idx-sys", SchemaDefinitionItemId = "sch-system-user", Name = "ix_email" });

        (await service.GetIndexesAsync("sch-system-user")).HttpStatusCode.Should().Be(404);
        (await service.CreateIndexAsync(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "sch-system-user", Fields = [new IndexFieldRequest { FieldName = "Email" }]
        })).HttpStatusCode.Should().Be(404);
        (await service.DeleteIndexAsync("idx-sys")).HttpStatusCode.Should().Be(404);
        (await _db.GetCollection<SchemaIndexDefinition>("SchemaIndexDefinitions").CountDocumentsAsync(i => i.ItemId == "idx-sys")).Should().Be(1);
    }
}
