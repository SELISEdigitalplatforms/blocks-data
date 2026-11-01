using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Models;
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

namespace XUnitTest.DataGateway;

/// <summary>
/// The save-time checks for the rules added by the validation and access rules plan (phase 5), in each path that
/// saves a rule: the validation API, schema import and publish. Kept apart from <c>ValidatorTests</c>, which must
/// stay unmodified (G6).
/// </summary>
public class NewRulesValidatorTests
{
    private readonly Mock<IDbRepository> _repo = new();

    private static readonly SchemaDefinition Invoice = new()
    {
        ItemId = "inv", SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity,
        Fields =
        [
            new FieldDefinition { Name = "Email", Type = "String" },
            new FieldDefinition { Name = "Country", Type = "String" },
            new FieldDefinition { Name = "Tags", Type = "String", IsArray = true },
            new FieldDefinition { Name = "Total", Type = "Float" },
        ],
    };

    private static readonly SchemaDefinition Blocklist = new()
    {
        ItemId = "blk", SchemaName = "Blocklist", CollectionName = "Blocklists", SchemaType = SchemaType.Entity,
        Fields = [new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Count", Type = "Int" }],
    };

    private static readonly SchemaDefinition User = new()
    {
        ItemId = "usr", SchemaName = "User", CollectionName = "Users", SchemaType = SchemaType.Entity, IsSystemEntity = true,
        Fields = [new FieldDefinition { Name = "Email", Type = "String" }],
    };

    private static string Render(FilterDefinition<SchemaDefinition> filter) =>
        filter.Render(new RenderArgs<SchemaDefinition>(BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>(), BsonSerializer.SerializerRegistry)).ToString();

    public NewRulesValidatorTests()
    {
        // The source schema by id, a target by name.
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> filter, string _) =>
            {
                var rendered = Render(filter);
                return new[] { Invoice, Blocklist, User }.FirstOrDefault(s => rendered.Contains($"\"{s.ItemId}\"") || rendered.Contains($"\"{s.SchemaName}\""));
            });
    }

    private static PolicyRuleGroup Where(string field, object value) => new()
    {
        Rules = [new() { LeftOperand = field, Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = value }],
    };

    private List<string> Save(string field, params ValidationRuleRequest[] rules) =>
        new CreateDataValidationRequestValidator(_repo.Object)
            .ValidateAsync(new CreateDataValidationRequest { SchemaId = "inv", FieldName = field, Validations = [.. rules] })
            .GetAwaiter().GetResult().Errors.Select(e => e.ErrorMessage).ToList();

    private static ValidationRuleRequest NotExistsIn(string target = "Blocklist", string? field = "Email") =>
        new() { Type = ValidationType.NotExistsIn, Value = target, SecondaryValue = field };

    // ── Validation API ──

    [Fact]
    public void Api_ChecksTheNewTypes()
    {
        Save("Country", new ValidationRuleRequest { Type = ValidationType.In, Value = new List<object?>() })
            .Should().Contain(ValidationRuleCheck.ValuesMustNotBeEmpty);
        Save("Country", new ValidationRuleRequest { Type = ValidationType.MinItems, Value = 1 })
            .Should().Contain(ValidationRuleCheck.OnlyForLists);
    }

    [Fact]
    public void Api_ChecksTheCondition()
    {
        Save("Email", new ValidationRuleRequest { Type = ValidationType.NotEmpty, When = Where("Missing", "x") })
            .Should().Contain(ValidationRuleCheck.UnknownProperty("Missing"));
        Save("Email", new ValidationRuleRequest { Type = ValidationType.NotEmpty, When = Where("Country", "DE") })
            .Should().BeEmpty();
    }

    [Fact]
    public void Api_UniqueItems_NeedsNoValue()
    {
        Save("Tags", new ValidationRuleRequest { Type = ValidationType.UniqueItems }).Should().BeEmpty();
    }

    [Fact]
    public void Api_OldRules_GetNoNewMessages()
    {
        // G12: a rule that uses nothing new is checked exactly as today.
        Save("Email",
            new ValidationRuleRequest { Type = ValidationType.NotEmpty, Value = "x" },
            new ValidationRuleRequest { Type = ValidationType.MaxLength, Value = 50 }).Should().BeEmpty();
    }

    [Fact]
    public void Api_OneReferenceAndOneMustNotExistIn_PerField()
    {
        Save("Email",
            new ValidationRuleRequest { Type = ValidationType.Reference, Value = "Blocklist", SecondaryValue = "Email" },
            NotExistsIn()).Should().BeEmpty();
        Save("Email", NotExistsIn(), NotExistsIn()).Should().Contain(DataValidationRequestValidatorMessages.OnlyOneMustNotExistIn);
    }

    [Fact]
    public void Api_MustNotExistIn_ChecksItsTargetLikeReference()
    {
        Save("Email", NotExistsIn("Invoice")).Should().Contain(ValidationRuleCheck.NotExistsInOwnSchema);
        Save("Email", NotExistsIn("Blocklist", "Count")).Should().Contain(ReferenceRuleCompatibility.TypesMustMatch);
        Save("Email", NotExistsIn("Nope")).Should().Contain(ReferenceRuleCompatibility.TargetSchemaMustBeEntity);
    }

    [Fact]
    public void Api_ATenantRule_MayTargetASystemEntity()
    {
        // Section 8: every system entity can be a target.
        Save("Email", new ValidationRuleRequest { Type = ValidationType.Reference, Value = "User", SecondaryValue = "Email" }).Should().BeEmpty();
        Save("Email", NotExistsIn("User")).Should().BeEmpty();
    }

    // ── Import ──

    private void ProjectHas(params SchemaDefinition[] schemas) =>
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
                It.Is<FilterDefinition<SchemaDefinition>>(f => Render(f).Contains("SchemaName")), It.IsAny<SortDefinition<SchemaDefinition>?>(), ""))
            .ReturnsAsync(schemas.ToList());

    private static SchemaExportDocument InvoiceDocument(params ExportValidationRule[] rules) => new()
    {
        SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity,
        Fields =
        [
            new ExportFieldDefinition { Name = "Email", Type = "String", ValidationRules = [.. rules] },
            new ExportFieldDefinition { Name = "Country", Type = "String" },
        ],
    };

    private Task<List<string>> Import(params ExportValidationRule[] rules) =>
        new SchemaImportValidator(_repo.Object).ValidateAsync([InvoiceDocument(rules)]);

    [Fact]
    public async Task Import_ChecksTheNewRules()
    {
        ProjectHas(Blocklist);
        (await Import(new ExportValidationRule { Type = ValidationType.NotEmpty, When = Where("Missing", "x") }))
            .Should().ContainSingle(e => e.EndsWith(ValidationRuleCheck.UnknownProperty("Missing")));
        (await Import(new ExportValidationRule { Type = ValidationType.UniqueItems }))
            .Should().ContainSingle(e => e.EndsWith(ValidationRuleCheck.OnlyForLists));
    }

    [Fact]
    public async Task Import_ChecksMustNotExistInTargets()
    {
        ProjectHas(Blocklist);
        (await Import(new ExportValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" })).Should().BeEmpty();
        (await Import(new ExportValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Count" }))
            .Should().ContainSingle(e => e.Contains(ReferenceRuleCompatibility.TypesMustMatch));
        (await Import(
                new ExportValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" },
                new ExportValidationRule { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email" }))
            .Should().Contain(e => e.EndsWith(DataValidationRequestValidatorMessages.OnlyOneMustNotExistIn));
    }

    // ── Publish ──

    private static SchemaSource InvoiceSource(ValidationRule rule) => new()
    {
        SchemaDefinitions = [Invoice],
        DataValidations = [new DataValidation { SchemaId = "inv", FieldName = "Country", Validations = [rule] }],
    };

    private static GraphqlSchemaBuilder Builder() => new(
        new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object),
        new Mock<IDbRepository>().Object,
        NullLogger<GraphqlSchemaBuilder>.Instance);

    [Fact]
    public void Publish_RefusesANewRuleThatDoesNotCheck_ARebuildStillBuilds()
    {
        var source = InvoiceSource(new ValidationRule { Type = ValidationType.In, Value = new List<object?>(), IsActive = true });

        var publish = () => Builder().BuildSchema("t", source, SchemaBuilder.New(), strictReferences: true);
        publish.Should().Throw<InvalidOperationException>().WithMessage($"*Invoice.Country In rule: {ValidationRuleCheck.ValuesMustNotBeEmpty}*");

        Builder().BuildSchema("t", source, SchemaBuilder.New()).Should().BeTrue();
    }

    [Fact]
    public void Publish_AcceptsAValidNewRule()
    {
        var source = InvoiceSource(new ValidationRule { Type = ValidationType.In, Value = new List<object?> { "DE", "AT" }, IsActive = true });
        Builder().BuildSchema("t", source, SchemaBuilder.New(), strictReferences: true).Should().BeTrue();
    }

    // ── Found in review ──

    [Fact]
    public void Api_AFilterMustNameThePropertiesOfTheTarget()
    {
        var reference = new ValidationRuleRequest
        {
            Type = ValidationType.Reference, Value = "Blocklist", SecondaryValue = "Email",
            TargetFilter = new PolicyRuleGroup { Rules = [new() { LeftOperand = "Statuss", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "x" }] },
        };
        Save("Email", reference).Should().Contain(DataValidationRequestValidatorMessages.FilterPropertyMissing("Statuss", "Blocklist"));

        reference.TargetFilter.Rules[0].LeftOperand = "Count";
        Save("Email", reference).Should().BeEmpty();
    }

    [Fact]
    public void Api_AConditionOnALookupRule_IsRefused()
    {
        Save("Email", new ValidationRuleRequest { Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email", When = Where("Country", "DE") })
            .Should().Contain(ValidationRuleCheck.ConditionOnLookup);
    }

    [Fact]
    public async Task Import_AFilterMustNameThePropertiesOfTheTarget_AndADescriptionIsAtMost500Characters()
    {
        ProjectHas(Blocklist);
        var document = InvoiceDocument(new ExportValidationRule
        {
            Type = ValidationType.NotExistsIn, Value = "Blocklist", SecondaryValue = "Email",
            TargetFilter = new PolicyRuleGroup { Rules = [new() { LeftOperand = "Statuss", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "x" }] },
        });
        document.Description = new string('a', 501);

        var errors = await new SchemaImportValidator(_repo.Object).ValidateAsync([document]);

        errors.Should().Contain(e => e.EndsWith(DataValidationRequestValidatorMessages.FilterPropertyMissing("Statuss", "Blocklist")));
        errors.Should().Contain(e => e.Contains("Description"));
    }
}

/// <summary>A tenant may name a schema like a system entity: rules then point at the tenant's own (as the build does).</summary>
public class NewRulesValidatorSameNameTests
{
    private static readonly SchemaDefinition SystemUser = new()
    {
        ItemId = "sys-user", SchemaName = "User", CollectionName = "Users", SchemaType = SchemaType.Entity, IsSystemEntity = true,
        Fields = [new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Password", Type = "String" }],
    };

    private static readonly SchemaDefinition TenantUser = new()
    {
        ItemId = "ten-user", SchemaName = "User", CollectionName = "TenantUsers", SchemaType = SchemaType.Entity,
        Fields = [new FieldDefinition { Name = "EmployeeCode", Type = "String" }],
    };

    private static readonly SchemaDefinition Invoice = new()
    {
        ItemId = "inv", SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity,
        Fields = [new FieldDefinition { Name = "Email", Type = "String" }],
    };

    private static IDbRepository Repository()
    {
        // The system row first, as in a project where the system rows were copied in before the tenant's own.
        List<SchemaDefinition> schemas = [SystemUser, TenantUser, Invoice];
        var serializer = BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>();
        List<SchemaDefinition> Matching(FilterDefinition<SchemaDefinition> f) =>
            schemas.Where(s => Blocks.Genesis.DataAccess.Evaluation.BsonFilterMatcher.Matches(s.ToBsonDocument(), f.Render(new RenderArgs<SchemaDefinition>(serializer, BsonSerializer.SerializerRegistry)))).ToList();
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> f, string _) => Matching(f).FirstOrDefault());
        repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<SortDefinition<SchemaDefinition>?>(), It.IsAny<string>()))
            .ReturnsAsync((FilterDefinition<SchemaDefinition> f, SortDefinition<SchemaDefinition>? _, string _) => Matching(f));
        return repo.Object;
    }

    private static List<string> Save(string targetField) =>
        new CreateDataValidationRequestValidator(Repository())
            .ValidateAsync(new CreateDataValidationRequest
            {
                SchemaId = "inv", FieldName = "Email",
                Validations = [new ValidationRuleRequest { Type = ValidationType.Reference, Value = "User", SecondaryValue = targetField }],
            })
            .GetAwaiter().GetResult().Errors.Select(e => e.ErrorMessage).ToList();

    [Fact]
    public void TheTenantsSchema_IsTheTarget()
    {
        Save("EmployeeCode").Should().BeEmpty();
        Save("Password").Should().Contain(ReferenceRuleCompatibility.TargetFieldMustExist);
    }

    [Fact]
    public async Task Import_PointsAtTheTenantsSchemaToo()
    {
        var document = new SchemaExportDocument
        {
            SchemaName = "Invoice", CollectionName = "Invoices", SchemaType = SchemaType.Entity,
            Fields = [new ExportFieldDefinition { Name = "Email", Type = "String", ValidationRules = [new ExportValidationRule { Type = ValidationType.Reference, Value = "User", SecondaryValue = "EmployeeCode", IsActive = true }] }],
        };
        (await new SchemaImportValidator(Repository()).ValidateAsync([document])).Should().BeEmpty();
    }
}
