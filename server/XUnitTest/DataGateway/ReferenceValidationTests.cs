using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using HotChocolate;
using Moq;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using static XUnitTest.DataGateway.TestSupport;
using Blocks.Genesis.DataAccess.Rules;

namespace XUnitTest.DataGateway;

/// <summary>Reference rules: the build-time target map, the values a mutation sends, and which fields may be linked.</summary>
public class ReferenceValidationTests
{
    private static ValidationRule Reference(string schema, string? field = null, bool active = true) =>
        new() { Type = ValidationType.Reference, Value = schema, SecondaryValue = field, IsActive = active };

    private static FieldDefinitionResponse WithRules(FieldDefinitionResponse field, params ValidationRule[] rules)
    {
        field.ValidationRule = new DataValidation { FieldName = field.Name, Validations = rules.ToList() };
        return field;
    }

    private static SchemaDefinitionExtended Entity(string name, string collection, params FieldDefinitionResponse[] fields)
    {
        var schema = Schema(schemaName: name, collectionName: collection, fields: fields.ToList());
        schema.ItemId = $"{name}-id";
        return schema;
    }

    private static (SchemaDefinitionExtended Employee, SchemaDefinitionExtended Department, SchemaDefinitionExtended Skill) Company()
    {
        var department = Entity("Department", "Departments", Field("Name"), Field("Code"), Field("Budget", "Float"));
        var skill = Entity("Skill", "Skills", Field("Name"));
        var employee = Entity("Employee", "Employees",
            Field("Name"),
            WithRules(Field("DepartmentId"), Reference("Department")),
            WithRules(Field("Skills", isArray: true), Reference("Skill", "ItemId")),
            WithRules(Field("DeptCode"), Reference("Department", "Code")),
            Field("Address", "Address", children: [WithRules(Field("DepartmentId"), Reference("Department"))]));
        return (employee, department, skill);
    }

    // ---- ReferenceTargets -------------------------------------------------------------------

    [Fact]
    public void Build_ResolvesTargetCollectionsAndStoredFieldNames()
    {
        var (employee, department, skill) = Company();

        var targets = ReferenceTargets.Build([employee, department, skill], strict: true, NullLogger.Instance);

        targets.HasReferences(employee).Should().BeTrue();
        targets.HasReferences(department).Should().BeFalse();
        targets.Find(Reference("Department"))!.Should().Be(new ReferenceTarget("Department", "ItemId", "Departments", "_id"));
        targets.Find(Reference("Department", "Code"))!.DbFieldName.Should().Be("Code");
        targets.Find(Reference("Skill", "ItemId"))!.CollectionName.Should().Be("Skills");
    }

    [Fact]
    public void Build_Strict_FailsOnMissingTargetSchemaOrField_NamingTheProperty()
    {
        var employee = Entity("Employee", "Employees",
            WithRules(Field("DepartmentId"), Reference("Department")),
            WithRules(Field("TeamCode"), Reference("Employee", "Nope")));

        var build = () => ReferenceTargets.Build([employee], strict: true, NullLogger.Instance);

        build.Should().Throw<InvalidOperationException>()
            .WithMessage("*Employee.DepartmentId references schema 'Department', which does not exist*")
            .WithMessage("*Employee.TeamCode references field 'Employee.Nope'*");
    }

    [Fact]
    public void Build_NotStrict_SkipsUnresolvedRules()
    {
        var employee = Entity("Employee", "Employees", WithRules(Field("DepartmentId"), Reference("Department")));

        var targets = ReferenceTargets.Build([employee], strict: false, NullLogger.Instance);

        targets.HasReferences(employee).Should().BeFalse();
        targets.Find(Reference("Department")).Should().BeNull();
    }

    [Fact]
    public void Build_IgnoresInactiveRulesAndDtoTargets()
    {
        var address = Schema(schemaName: "Address", collectionName: "");
        address.SchemaType = SchemaType.Dto;
        var employee = Entity("Employee", "Employees",
            WithRules(Field("DepartmentId"), Reference("Department", active: false)),
            WithRules(Field("AddressId"), Reference("Address")));

        var build = () => ReferenceTargets.Build([employee, address], strict: true, NullLogger.Instance);

        // The inactive rule is not resolved at all; the DTO is not a valid target.
        build.Should().Throw<InvalidOperationException>().Which.Message.Should().NotContain("DepartmentId").And.Contain("AddressId");
    }

    // ---- ReferenceValueCollector -------------------------------------------------------------

    [Fact]
    public void Collect_TakesSentValues_ListsElementByElement_AndNestedPaths()
    {
        var (employee, department, skill) = Company();
        var targets = ReferenceTargets.Build([employee, department, skill], strict: true, NullLogger.Instance);
        var input = new Dictionary<string, object?>
        {
            ["Name"] = "Ann",
            ["DepartmentId"] = "d1",
            ["Skills"] = new List<object?> { "s1", null, "s3", " " },
            ["Address"] = new Dictionary<string, object?> { ["DepartmentId"] = "d2" },
        };

        var values = ReferenceValueCollector.Collect([input], employee, targets);

        values.Select(v => (v.Path, v.Value)).Should().BeEquivalentTo(new (string, object)[]
        {
            ("DepartmentId", "d1"), ("Skills[0]", "s1"), ("Skills[2]", "s3"), ("Address.DepartmentId", "d2"),
        });
    }

    [Fact]
    public void Collect_PartialUpdate_OnlyWhatWasSent_AndSkipsNullOrBlank()
    {
        var (employee, department, skill) = Company();
        var targets = ReferenceTargets.Build([employee, department, skill], strict: true, NullLogger.Instance);

        ReferenceValueCollector.Collect([new() { ["Name"] = "Ann" }], employee, targets).Should().BeEmpty();
        ReferenceValueCollector.Collect([new() { ["DepartmentId"] = null, ["DeptCode"] = "" }], employee, targets).Should().BeEmpty();
    }

    [Fact]
    public void Collect_RemembersWhichBatchItemSentTheValue()
    {
        var (employee, department, skill) = Company();
        var targets = ReferenceTargets.Build([employee, department, skill], strict: true, NullLogger.Instance);

        var values = ReferenceValueCollector.Collect([new() { ["Name"] = "A" }, new() { ["DepartmentId"] = "d9" }], employee, targets);

        values.Should().ContainSingle().Which.InputIndex.Should().Be(1);
    }

    // ---- ReferenceRuleCompatibility ----------------------------------------------------------

    private static SchemaDefinition Target(SchemaType type = SchemaType.Entity, bool isSystem = false, params FieldDefinition[] fields) =>
        new() { SchemaName = "Department", SchemaType = type, IsSystemEntity = isSystem, Fields = fields.ToList() };

    [Theory]
    [InlineData("String", false, "ItemId", null)]
    [InlineData("String", true, "ItemId", null)] // a list of ids, checked element by element
    [InlineData("Enum", false, "Code", null)]
    [InlineData("Int", false, "Budget", null)] // Int and Float compare as numbers
    [InlineData("Int", false, "ItemId", ReferenceRuleCompatibility.TypesMustMatch)]
    [InlineData("String", false, "Budget", ReferenceRuleCompatibility.TypesMustMatch)]
    [InlineData("DateTime", false, "ItemId", ReferenceRuleCompatibility.SourceFieldNotSupported)]
    [InlineData("Boolean", false, "ItemId", ReferenceRuleCompatibility.SourceFieldNotSupported)]
    [InlineData("String", false, "Tags", ReferenceRuleCompatibility.TargetFieldMustExist)]
    [InlineData("String", false, "Missing", ReferenceRuleCompatibility.TargetFieldMustExist)]
    public void Check_FieldKindsMustMatch(string sourceType, bool sourceIsArray, string targetField, string? expected)
    {
        var target = Target(fields:
        [
            new FieldDefinition { Name = "Code", Type = "String" },
            new FieldDefinition { Name = "Budget", Type = "Float" },
            new FieldDefinition { Name = "Tags", Type = "String", IsArray = true },
        ]);
        var source = new FieldDefinition { Name = "Ref", Type = sourceType, IsArray = sourceIsArray };

        ReferenceRuleCompatibility.Check(source, target, targetField).Should().Be(expected);
    }

    [Fact]
    public void Check_TargetMustBeAnExistingEntity_TenantOrSystem()
    {
        var source = new FieldDefinition { Name = "DepartmentId", Type = "String" };

        ReferenceRuleCompatibility.Check(source, null, "ItemId").Should().Be(ReferenceRuleCompatibility.TargetSchemaMustBeEntity);
        ReferenceRuleCompatibility.Check(source, Target(SchemaType.Dto), "ItemId").Should().Be(ReferenceRuleCompatibility.TargetSchemaMustBeEntity);
        // A tenant rule may point at a system entity (owner decision 2026-10-25, validation and access rules plan, section 8).
        ReferenceRuleCompatibility.Check(source, Target(isSystem: true), "ItemId").Should().BeNull();
    }

    // ---- Schema build (publish vs pod rebuild) ----------------------------------------------

    private static SchemaSource SourcePointingAt(string targetSchema) => new()
    {
        SchemaDefinitions =
        [
            new SchemaDefinition
            {
                ItemId = "emp", SchemaName = "Employee", CollectionName = "Employees", SchemaType = SchemaType.Entity,
                Fields = [new FieldDefinition { Name = "DepartmentId", Type = "String" }],
            },
        ],
        DataValidations = [new DataValidation { SchemaId = "emp", FieldName = "DepartmentId", Validations = [Reference(targetSchema)] }],
    };

    private static GraphqlSchemaBuilder Builder() => new(
        new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object),
        new Mock<IDbRepository>().Object,
        NullLogger<GraphqlSchemaBuilder>.Instance);

    [Fact]
    public void BuildSchema_Strict_FailsWhenTheTargetSchemaIsMissing_NonStrictStillBuilds()
    {
        var strict = () => Builder().BuildSchema("t", SourcePointingAt("Department"), SchemaBuilder.New(), strictReferences: true);
        strict.Should().Throw<InvalidOperationException>().WithMessage("*Employee.DepartmentId references schema 'Department'*");

        Builder().BuildSchema("t", SourcePointingAt("Department"), SchemaBuilder.New()).Should().BeTrue();
        Builder().BuildSchema("t", SourcePointingAt("Employee"), SchemaBuilder.New(), strictReferences: true).Should().BeTrue();
    }

    [Fact]
    public void BuildSchema_Strict_FailsWhenATemplateNamesAMissingProperty()
    {
        SchemaSource Source(string template) => new()
        {
            SchemaDefinitions =
            [
                new SchemaDefinition
                {
                    ItemId = "emp", SchemaName = "Employee", CollectionName = "Employees", SchemaType = SchemaType.Entity,
                    Fields =
                    [
                        new FieldDefinition { Name = "FirstName", Type = "String" },
                        new FieldDefinition { Name = "DisplayName", Type = "String", DefaultValue = new FieldDefaultValue { Kind = DefaultValueKind.Template, Value = template } },
                    ],
                },
            ],
        };

        var strict = () => Builder().BuildSchema("t", Source("{{Employee.LastName}}"), SchemaBuilder.New(), strictReferences: true);
        strict.Should().Throw<InvalidOperationException>().WithMessage("*Employee.DisplayName default value: Unknown property \"Employee.LastName\"*");

        Builder().BuildSchema("t", Source("{{Employee.LastName}}"), SchemaBuilder.New()).Should().BeTrue();
        Builder().BuildSchema("t", Source("{{Employee.FirstName}}"), SchemaBuilder.New(), strictReferences: true).Should().BeTrue();
    }
}
