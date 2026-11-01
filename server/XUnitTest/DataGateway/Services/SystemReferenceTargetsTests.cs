using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using HotChocolate;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// System entities as targets of Reference and Must not exist in rules (validation and access rules plan, section 8,
/// phase 5): the schema build resolves them, and the picker endpoint lists them in their own group. A tenant whose
/// rules don't point at a system entity builds and snapshots exactly as before.
/// </summary>
[Collection("Mongo")]
public class SystemReferenceTargetsTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;
    private readonly GraphqlSchemaBuilder _builder;

    public SystemReferenceTargetsTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);
        _repository = new DbRepository(contextProvider.Object, Mock.Of<IBlocksSecret>());
        _builder = new GraphqlSchemaBuilder(new SchemaResolver(Mock.Of<IMutationService>(), Mock.Of<IQueryService>()), _repository, NullLogger<GraphqlSchemaBuilder>.Instance);
        BlocksTestContext.Set(tenantId: Tenant);
    }

    private static SchemaDefinition Entity(string id, string name, bool system = false, string? description = null, bool deleted = false, SchemaType type = SchemaType.Entity, params FieldDefinition[] fields) => new()
    {
        ItemId = id, SchemaName = name, CollectionName = name + "s", SchemaType = type, IsSystemEntity = system, Description = description, IsDeleted = deleted,
        Fields = fields.Length > 0 ? [.. fields] : [new FieldDefinition { Name = "Email", Type = "String" }],
    };

    private static ValidationRule Reference(string target, ValidationType type = ValidationType.Reference) =>
        new() { Type = type, Value = target, SecondaryValue = "Email", EvaluationVersion = 2, IsActive = true };

    private async Task SeedAsync(params ValidationRule[] invoiceEmailRules)
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
        [
            Entity("sch-invoice", "Invoice"),
            Entity("sch-user", "User", system: true),
            Entity("sch-secret", "Secret", system: true),
        ]);
        if (invoiceEmailRules.Length > 0)
            await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(
                new DataValidation { ItemId = "val-1", SchemaId = "sch-invoice", FieldName = "Email", Validations = [.. invoiceEmailRules] });
    }

    // ── The schema build ──

    [Fact]
    public async Task DraftSource_CarriesOnlyTheSystemEntitiesRulesPointAt()
    {
        await SeedAsync(Reference("User"));

        var source = await _builder.ReadDraftSourceAsync(Tenant);

        source.SchemaDefinitions.Select(s => s.SchemaName).Should().Equal("Invoice");   // still no GraphQL type for them
        source.SystemEntitySchemas.Select(s => s.SchemaName).Should().Equal("User");
    }

    [Fact]
    public async Task DraftSource_WithoutRulesOnSystemEntities_CarriesNone()
    {
        await SeedAsync(Reference("Invoice"), new ValidationRule { Type = ValidationType.NotEmpty, Value = "User" });
        (await _builder.ReadDraftSourceAsync(Tenant)).SystemEntitySchemas.Should().BeEmpty();
    }

    [Theory]
    [InlineData(ValidationType.Reference)]
    [InlineData(ValidationType.NotExistsIn)]
    public async Task APublish_ResolvesASystemEntityTarget(ValidationType type)
    {
        await SeedAsync(Reference("User", type));
        var source = await _builder.ReadDraftSourceAsync(Tenant);

        _builder.BuildSchema(Tenant, source, SchemaBuilder.New(), strictReferences: true).Should().BeTrue();

        var withoutTargets = new SchemaSource { SchemaDefinitions = source.SchemaDefinitions, DataValidations = source.DataValidations };
        var publish = () => _builder.BuildSchema(Tenant, withoutTargets, SchemaBuilder.New(), strictReferences: true);
        publish.Should().Throw<InvalidOperationException>().WithMessage("*references schema 'User'*");
    }

    [Fact]
    public async Task ASnapshot_KeepsTheSystemTargets_AndHasNoNewKeyWithoutThem()
    {
        await SeedAsync(Reference("User"));
        var source = await _builder.ReadDraftSourceAsync(Tenant);

        SchemaSnapshotStore.Unpack(SchemaSnapshotStore.Pack(source).CompressedBytes).SystemEntitySchemas
            .Select(s => s.SchemaName).Should().Equal("User");

        var plain = new SchemaSource { SchemaDefinitions = source.SchemaDefinitions, DataValidations = source.DataValidations };
        Unzip(SchemaSnapshotStore.Pack(plain).CompressedBytes).Names.Should().Equal("SchemaDefinitions", "DataValidations", "DataAccessPolicies");
    }

    private static BsonDocument Unzip(byte[] compressed)
    {
        using var input = new System.IO.Compression.GZipStream(new MemoryStream(compressed), System.IO.Compression.CompressionMode.Decompress);
        using var raw = new MemoryStream();
        input.CopyTo(raw);
        return BsonSerializer.Deserialize<BsonDocument>(raw.ToArray());
    }

    // ── The picker endpoint ──

    private SchemaDefinitionService Service() => new(
        _repository, Mock.Of<IRequestValidator>(), Mock.Of<ISchemaChangeLogService>(),
        new SchemaDefinitionReferenceHelper(_repository, Mock.Of<ISchemaChangeLogService>()), Mock.Of<ISchemaIndexService>(),
        NullLogger<SchemaDefinitionService>.Instance);

    [Fact]
    public async Task ReferenceTargets_ListsTenantAndSystemEntitiesInTheirOwnGroups()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
        [
            Entity("s1", "Invoice", description: "Bills we send",
                fields: [new FieldDefinition { Name = "Email", Type = "String", IsUniqueData = true }, new FieldDefinition { Name = "Lines", Type = "String", IsArray = true, IsPIIData = true }, new FieldDefinition { Name = "Address.City", Type = "String", IsReferenceField = true }]),
            Entity("s2", "User", system: true),
            Entity("s3", "Old", deleted: true),
            Entity("s4", "Address", type: SchemaType.Dto),
        ]);

        var response = (await Service().GetReferenceTargetsAsync(null)).Data!;

        response.Entities.Select(s => s.SchemaName).Should().Equal("Invoice");
        response.SystemEntities.Select(s => s.SchemaName).Should().Equal("User");
        var invoice = response.Entities.Single();
        invoice.Description.Should().Be("Bills we send");
        invoice.IsSystemEntity.Should().BeFalse();
        invoice.Fields.Select(f => (f.Name, f.Type, f.IsArray, f.IsPIIData, f.IsUniqueData)).Should().Equal(("Email", "String", false, false, true), ("Lines", "String", true, true, false));
        response.SystemEntities.Single().IsSystemEntity.Should().BeTrue();
    }

    [Fact]
    public async Task ReferenceTargets_CarryAnEnumsValues_SoAFilterCanOfferThem()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(Entity("s1", "Invoice", fields:
            [new FieldDefinition { Name = "Status", Type = "Enum", EnumValues = ["Open", "Paid"] }, new FieldDefinition { Name = "Email", Type = "String" }]));

        var fields = (await Service().GetReferenceTargetsAsync(null)).Data!.Entities.Single().Fields;

        fields.Single(f => f.Name == "Status").EnumValues.Should().Equal("Open", "Paid");
        fields.Single(f => f.Name == "Email").EnumValues.Should().BeNull();
    }

    [Theory]
    [InlineData("inv", "Invoice")]      // name, any case
    [InlineData("BILLS", "Invoice")]    // description
    [InlineData("a.b", null)]           // plain text, not a pattern
    public async Task ReferenceTargets_SearchesNamesAndDescriptions(string keyword, string? found)
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
            [Entity("s1", "Invoice", description: "Bills we send"), Entity("s2", "Axb")]);

        var response = (await Service().GetReferenceTargetsAsync(keyword)).Data!;

        response.Entities.Select(s => s.SchemaName).Should().Equal(found is null ? [] : [found]);
    }

    [Fact]
    public async Task ReferenceTargets_ReturnsAtMost50PerGroup_HiddenSystemEntitiesTakeNoPlace()
    {
        // System00… aren't entities Genesis opens to rules, so they never reach the limit; User does.
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
            Enumerable.Range(0, 60).Select(i => Entity($"t{i}", $"Tenant{i:00}"))
                .Concat(Enumerable.Range(0, 55).Select(i => Entity($"y{i}", $"System{i:00}", system: true)))
                .Append(Entity("u", "User", system: true)));

        var response = (await Service().GetReferenceTargetsAsync(null)).Data!;

        response.Entities.Should().HaveCount(50);
        response.SystemEntities.Select(s => s.SchemaName).Should().Equal("User");
        response.Entities.First().SchemaName.Should().Be("Tenant00");   // by name
    }

    // ── Secrets are never lookup targets ──

    private static SchemaDefinition UserWithSecrets() => Entity("sch-user", "User", system: true, fields:
    [
        new FieldDefinition { Name = "ItemId", Type = "String" },
        new FieldDefinition { Name = "Email", Type = "String" },
        new FieldDefinition { Name = "Password", Type = "String" },
        new FieldDefinition { Name = "SecurityStamp", Type = "String" },
    ]);

    [Fact]
    public async Task ThePicker_OffersOnlyWhatGenesisOpensToRules_NeverSecrets()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([UserWithSecrets(), Entity("sch-secret", "Secret", system: true)]);

        var response = (await Service().GetReferenceTargetsAsync(null)).Data!;

        response.SystemEntities.Select(s => s.SchemaName).Should().Equal("User");
        response.SystemEntities.Single().Fields.Select(f => f.Name).Should().Equal("ItemId", "Email");
        (await Service().GetReferenceTargetsAsync(null, schemaName: "Secret")).Data!.SystemEntities.Should().BeEmpty();
    }

    [Fact]
    public async Task Saving_ARuleOnASecret_IsRefused_AsTheFieldOrInTheFilter()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([UserWithSecrets(), Entity("sch-secret", "Secret", system: true)]);
        var source = new FieldDefinition { Name = "Email", Type = "String" };

        var user = await DataValidationRequestValidatorMessages.FindTargetAsync(_repository, "User");
        user!.Fields.Select(f => f.Name).Should().Equal("ItemId", "Email");
        ReferenceRuleCompatibility.Check(source, user, "Password").Should().NotBeNull();
        ReferenceRuleCompatibility.Check(source, user, "Email").Should().BeNull();
        var byPassword = new PolicyRuleGroup { Rules = [new() { LeftOperand = "Password", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "x" }] };
        DataValidationRequestValidatorMessages.FilterProblems(byPassword, user).Should().Equal("Password isn't a property of User");

        (await DataValidationRequestValidatorMessages.FindTargetAsync(_repository, "Secret")).Should().BeNull();
    }

    [Fact]
    public async Task Importing_ARuleOnASecret_IsRefused()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([UserWithSecrets(), Entity("sch-secret", "Secret", system: true)]);
        ExportFieldDefinition Email(string target, string field) => new()
        {
            Name = "Email", Type = "String",
            ValidationRules = [new ExportValidationRule { Type = ValidationType.NotExistsIn, Value = target, SecondaryValue = field, IsActive = true, EvaluationVersion = 2 }],
        };
        var documents = new List<SchemaExportDocument>
        {
            new() { SchemaName = "Lead", CollectionName = "Leads", SchemaType = SchemaType.Entity, Fields = [Email("User", "Email")] },
            new() { SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Fields = [Email("User", "Password")] },
            new() { SchemaName = "Note", CollectionName = "Notes", SchemaType = SchemaType.Entity, Fields = [Email("Secret", "Email")] },
        };

        var errors = await new SchemaImportValidator(_repository).ValidateAsync(documents);

        errors.Should().HaveCount(2);
        errors.Should().Contain(e => e.Contains("'User.Password'")).And.Contain(e => e.Contains("'Secret.Email'"));
    }

    [Theory]
    [InlineData("User", "Password")]
    [InlineData("Secret", "Email")]
    public async Task APublish_WithARuleOnASecret_Fails(string target, string field)
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([Entity("sch-invoice", "Invoice"), UserWithSecrets(), Entity("sch-secret", "Secret", system: true)]);
        var rule = new ValidationRule { Type = ValidationType.NotExistsIn, Value = target, SecondaryValue = field, EvaluationVersion = 2, IsActive = true };
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(new DataValidation { ItemId = "val-1", SchemaId = "sch-invoice", FieldName = "Email", Validations = [rule] });
        var source = await _builder.ReadDraftSourceAsync(Tenant);

        var publish = () => _builder.BuildSchema(Tenant, source, SchemaBuilder.New(), strictReferences: true);
        publish.Should().Throw<InvalidOperationException>();
        _builder.BuildSchema(Tenant, source, SchemaBuilder.New()).Should().BeTrue();   // otherwise left unchecked
    }

    // ── Found in review ──

    [Fact]
    public async Task AFilter_OnANestedPropertyOfASystemEntity_Resolves()
    {
        // The seed stores a system schema's nested properties as dotted reference rows; Addresses is open to rules.
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
        [
            Entity("sch-invoice", "Invoice"),
            Entity("sch-org", "Organization", system: true, fields: [new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Addresses.City", Type = "String", IsReferenceField = true }]),
        ]);
        var rule = Reference("Organization", ValidationType.NotExistsIn);
        rule.TargetFilter = new PolicyRuleGroup { Rules = [new() { LeftOperand = "Addresses.City", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "Bern" }] };
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(new DataValidation { ItemId = "val-1", SchemaId = "sch-invoice", FieldName = "Email", Validations = [rule] });

        _builder.BuildSchema(Tenant, await _builder.ReadDraftSourceAsync(Tenant), SchemaBuilder.New(), strictReferences: true).Should().BeTrue();
    }

    [Fact]
    public async Task ATenantChildSchemaOfTheSameName_DoesNotHideTheSystemEntity()
    {
        await SeedAsync(Reference("User"));
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(Entity("sch-dto-user", "User", type: SchemaType.Dto));

        (await _builder.ReadDraftSourceAsync(Tenant)).SystemEntitySchemas.Select(s => s.SchemaName).Should().Equal("User");
    }

    [Fact]
    public async Task ReferenceTargets_FindsOneSchemaByItsExactName_HoweverManyOthersMatchTheWord()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync(
            Enumerable.Range(0, 60).Select(i => Entity($"a{i}", $"AUser{i:00}"))
                .Append(Entity("u", "User")));

        var response = (await Service().GetReferenceTargetsAsync(null, schemaName: "User")).Data!;

        response.Entities.Select(s => s.SchemaName).Should().Equal("User");
        response.SystemEntities.Should().BeEmpty();
    }

    [Fact]
    public async Task Import_IntoAnExistingSchema_KeepsTheFilesDescription()
    {
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(Entity("sch-order", "Order", description: "Old"));
        var import = new SchemaImportService(Mock.Of<IMessageClient>(), _repository, NullLogger<SchemaImportService>.Instance, new SchemaImportValidator(_repository));
        var documents = new List<SchemaExportDocument>
        {
            new() { SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity, Description = "Orders placed online", Fields = [new ExportFieldDefinition { Name = "Email", Type = "String" }] },
        };

        await import.ProcessImportAsync(new SchemaImportEvent { FileId = "f", ProjectKey = Tenant }, System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(documents));

        (await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").Find(s => s.SchemaName == "Order").SingleAsync()).Description.Should().Be("Orders placed online");
    }
}
