using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using Moq;

namespace XUnitTest.DataGateway;

/// <summary>Reference rules in an import file point at a schema by name: in the same file, or already in the project.</summary>
public class SchemaImportReferenceTests
{
    private readonly Mock<IDbRepository> _repo = new();

    private static string Render(FilterDefinition<SchemaDefinition> filter) =>
        filter.Render(new RenderArgs<SchemaDefinition>(BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>(), BsonSerializer.SerializerRegistry)).ToString();

    private void ProjectHas(params SchemaDefinition[] schemas) =>
        _repo.Setup(r => r.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
                It.Is<FilterDefinition<SchemaDefinition>>(f => Render(f).Contains("SchemaName")), It.IsAny<SortDefinition<SchemaDefinition>?>(), ""))
            .ReturnsAsync(schemas.ToList());

    private static SchemaExportDocument Employee(string target, string? targetField = null, string sourceType = "String") => new()
    {
        SchemaName = "Employee",
        CollectionName = "Employees",
        SchemaType = SchemaType.Entity,
        Fields =
        [
            new ExportFieldDefinition
            {
                Name = "DepartmentId",
                Type = sourceType,
                ValidationRules = [new ExportValidationRule { Type = ValidationType.Reference, Value = target, SecondaryValue = targetField, IsActive = true }],
            },
        ],
    };

    private static SchemaExportDocument DepartmentDocument() => new()
    {
        SchemaName = "Department",
        CollectionName = "Departments",
        SchemaType = SchemaType.Entity,
        Fields = [new ExportFieldDefinition { Name = "Code", Type = "String" }],
    };

    private Task<List<string>> Validate(params SchemaExportDocument[] documents) =>
        new SchemaImportValidator(_repo.Object).ValidateAsync(documents.ToList());

    [Fact]
    public async Task TargetInTheSameFile_IsAccepted()
    {
        (await Validate(Employee("Department"), DepartmentDocument())).Should().BeEmpty();
        (await Validate(Employee("Department", "Code"), DepartmentDocument())).Should().BeEmpty();
    }

    [Fact]
    public async Task TargetAlreadyInTheProject_IsAccepted()
    {
        ProjectHas(new SchemaDefinition { SchemaName = "Department", SchemaType = SchemaType.Entity });

        (await Validate(Employee("Department"))).Should().BeEmpty();
    }

    [Fact]
    public async Task TargetNowhere_OrIncompatible_IsRefused()
    {
        ProjectHas();

        (await Validate(Employee("Department"))).Should().ContainSingle()
            .Which.Should().Contain("Reference to 'Department.ItemId'").And.Contain(ReferenceRuleCompatibility.TargetSchemaMustBeEntity);
        (await Validate(Employee("Department", "Missing"), DepartmentDocument())).Should().ContainSingle()
            .Which.Should().Contain(ReferenceRuleCompatibility.TargetFieldMustExist);
        (await Validate(Employee("Department", sourceType: "DateTime"), DepartmentDocument())).Should().ContainSingle()
            .Which.Should().Contain(ReferenceRuleCompatibility.SourceFieldNotSupported);
    }
}
