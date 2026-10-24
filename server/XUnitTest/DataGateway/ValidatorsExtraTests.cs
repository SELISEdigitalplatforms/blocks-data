using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Blocks.Genesis.DataAccess.Rules;

namespace XUnitTest.DataGateway;

public class SchemaRequestValidatorsTests
{
    private readonly Mock<IDbRepository> _repo = new();

    public SchemaRequestValidatorsTests()
    {
        // No existing schema by default (name is unique).
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
    }

    [Fact]
    public void CreateSchema_Valid_Passes()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateSchema_EmptyName_Fails()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaRequest { SchemaName = "", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "SchemaName");
    }

    [Fact]
    public void CreateSchema_InvalidNameChars_Fails()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaRequest { SchemaName = "1Bad", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateSchema_EntityMissingCollection_Fails()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaRequest { SchemaName = "Person", CollectionName = "", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateSchema_Dto_AllowsEmptyCollection()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaRequest { SchemaName = "PersonDto", CollectionName = "", SchemaType = SchemaType.Dto });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task CreateSchema_IsValidSchemaName_ChecksRepository()
    {
        var v = new CreateSchemaRequestValidator(_repo.Object);
        (await v.IsValidSchemaName("New")).Should().BeTrue();
        (await v.IsValidCollectionName("c", SchemaType.Dto)).Should().BeTrue();
        (await v.IsValidCollectionName("c", SchemaType.Entity)).Should().BeTrue();
    }

    [Fact]
    public void UpdateSchema_MissingItemId_Fails()
    {
        var v = new UpdateSchemaRequestValidator();
        var result = v.Validate(new UpdateSchemaRequest { ItemId = "", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void UpdateSchema_Valid_Passes()
    {
        var v = new UpdateSchemaRequestValidator();
        var result = v.Validate(new UpdateSchemaRequest { ItemId = "1", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateSchemaDefinition_Valid_Passes()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var v = new CreateSchemaDefinitionRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaDefinitionRequest
        {
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateSchemaDefinition_DuplicateFields_Fails()
    {
        var v = new CreateSchemaDefinitionRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaDefinitionRequest
        {
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinitionRequest { Name = "Email", Type = "String" },
                new FieldDefinitionRequest { Name = "Email", Type = "String" }
            }
        });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateSchemaDefinition_NoFields_Fails()
    {
        var v = new CreateSchemaDefinitionRequestValidator(_repo.Object);
        var result = v.Validate(new CreateSchemaDefinitionRequest { SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity, Fields = new() });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateSchemaDefinition_Valid_Passes()
    {
        var v = new UpdateSchemaDefinitionRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new UpdateSchemaDefinitionRequest
        {
            ItemId = "1",
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task SaveFieldDefinition_Valid_Passes()
    {
        var v = new SaveFieldDefinitionRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new SaveFieldDefinitionRequest
        {
            SchemaDefinitionItemId = "1",
            Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } }
        });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task SaveFieldDefinition_MissingId_Fails()
    {
        var v = new SaveFieldDefinitionRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new SaveFieldDefinitionRequest { SchemaDefinitionItemId = "", Fields = new() { new FieldDefinitionRequest { Name = "Email", Type = "String" } } });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task FieldDefinition_CustomTypeResolvesFromRepository()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), ""))
            .ReturnsAsync(new SchemaDefinition { SchemaName = "Address" });
        var v = new FieldDefinitionRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new FieldDefinitionRequest { Name = "Addr", Type = "Address" });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task FieldDefinition_UnknownType_Fails()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), ""))
            .ReturnsAsync((SchemaDefinition?)null);
        var v = new FieldDefinitionRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new FieldDefinitionRequest { Name = "Addr", Type = "Nonexistent" });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void FieldDefinition_NullRepo_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => new FieldDefinitionRequestValidator(null!));
    }
}

public class SimpleValidatorsTests
{
    [Fact]
    public void ConfigureSecurity_ClsMissingFieldNames_Fails()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        var result = v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "1", PolicyType = PolicyType.CLS, FieldNames = Array.Empty<string>() });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ConfigureSecurity_Valid_Passes()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        var result = v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "1", PolicyType = PolicyType.RLS, Operation = PolicyOperation.READ, AccessLevel = SchemaAccessLevel.Public });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ConfigureSecurity_SchemaLevelInherited_Fails()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        var result = v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "1", PolicyType = PolicyType.RLS, Operation = PolicyOperation.READ, AccessLevel = SchemaAccessLevel.Inherited });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.ErrorMessage == "Schema_Access_Level_Cannot_Be_Inherited.");
    }

    [Fact]
    public void ConfigureSecurity_PropertyLevelInherited_Passes()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        var result = v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "1", PolicyType = PolicyType.CLS, Operation = PolicyOperation.READ, AccessLevel = SchemaAccessLevel.Inherited, FieldNames = ["Name"] });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ConfigureSecurity_MissingSchemaId_Fails()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ImportSchema_MissingFileId_Fails()
    {
        var v = new ImportSchemaRequestValidator();
        v.Validate(new ImportSchemaRequest { FileId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ImportSchema_Valid_Passes()
    {
        var v = new ImportSchemaRequestValidator();
        v.Validate(new ImportSchemaRequest { FileId = "f1" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateDataAccessPolicy_MissingItemId_Fails()
    {
        var v = new UpdateDataAccessPolicyRequestValidator();
        v.Validate(new UpdateDataAccessPolicyRequest { ItemId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void UpdateDataAccessPolicy_EmptyPolicyName_Fails()
    {
        var v = new UpdateDataAccessPolicyRequestValidator();
        v.Validate(new UpdateDataAccessPolicyRequest { ItemId = "1", PolicyName = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void UpdateDataAccessPolicy_Valid_Passes()
    {
        var v = new UpdateDataAccessPolicyRequestValidator();
        var result = v.Validate(new UpdateDataAccessPolicyRequest { ItemId = "1", PolicyName = "P", PolicyDescription = "d", FieldNames = new[] { "Email" } });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateDataValidationRuleValidator_RangeNeedsSecondaryValue()
    {
        var v = new ValidationRuleRequestValidator();
        var missing = v.Validate(new ValidationRuleRequest { Type = ValidationType.Range, Value = 1 });
        missing.IsValid.Should().BeFalse();

        var ok = v.Validate(new ValidationRuleRequest { Type = ValidationType.Range, Value = 1, SecondaryValue = 10 });
        ok.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateDataValidationRuleValidator_ValueRequiredExceptNotEmpty()
    {
        var v = new ValidationRuleRequestValidator();
        v.Validate(new ValidationRuleRequest { Type = ValidationType.NotEmpty }).IsValid.Should().BeTrue();
        v.Validate(new ValidationRuleRequest { Type = ValidationType.MaxLength, Value = null }).IsValid.Should().BeFalse();
    }
}

public class DataValidationRequestValidatorTests
{
    private readonly Mock<IDbRepository> _repo = new();

    [Fact]
    public async Task Create_Valid_Passes()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "s1" });
        var v = new CreateDataValidationRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new CreateDataValidationRequest
        {
            SchemaId = "s1",
            FieldName = "Email",
            Validations = new() { new ValidationRuleRequest { Type = ValidationType.NotEmpty } }
        });
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Create_SchemaMissing_Fails()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync((SchemaDefinition?)null);
        var v = new CreateDataValidationRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new CreateDataValidationRequest
        {
            SchemaId = "missing",
            FieldName = "Email",
            Validations = new() { new ValidationRuleRequest { Type = ValidationType.NotEmpty } }
        });
        result.IsValid.Should().BeFalse();
    }

    private static string Render(FilterDefinition<SchemaDefinition> filter) =>
        filter.Render(new RenderArgs<SchemaDefinition>(
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry.GetSerializer<SchemaDefinition>(),
            MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry)).ToString();

    /// <summary>Employee (source) answers lookups by id; <paramref name="target"/> answers lookups by schema name.</summary>
    private void SetupReference(SchemaDefinition? target, string sourceType = "String")
    {
        var employee = new SchemaDefinition
        {
            ItemId = "emp", SchemaName = "Employee", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "DepartmentId", Type = sourceType }, new FieldDefinition { Name = "Address.DeptId", Type = "String", IsReferenceField = true }],
        };
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.Is<FilterDefinition<SchemaDefinition>>(f => !Render(f).Contains("SchemaName")), ""))
            .ReturnsAsync(employee);
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.Is<FilterDefinition<SchemaDefinition>>(f => Render(f).Contains("SchemaName")), ""))
            .ReturnsAsync(target);
    }

    private static SchemaDefinition Department(SchemaType type = SchemaType.Entity) => new()
    {
        ItemId = "dep", SchemaName = "Department", SchemaType = type, Fields = [new FieldDefinition { Name = "Code", Type = "String" }],
    };

    private static CreateDataValidationRequest ReferenceRequest(string fieldName = "DepartmentId", params ValidationRuleRequest[] extra) => new()
    {
        SchemaId = "emp",
        FieldName = fieldName,
        Validations = [new ValidationRuleRequest { Type = ValidationType.Reference, Value = "Department" }, .. extra],
    };

    [Fact]
    public async Task Create_Reference_ToAnEntity_Passes_IncludingNestedPathsAndOtherTargetFields()
    {
        SetupReference(Department());
        var v = new CreateDataValidationRequestValidator(_repo.Object);

        (await v.ValidateAsync(ReferenceRequest())).IsValid.Should().BeTrue();
        (await v.ValidateAsync(ReferenceRequest("Address.DeptId"))).IsValid.Should().BeTrue();
        var byCode = ReferenceRequest();
        byCode.Validations[0].SecondaryValue = "Code";
        (await v.ValidateAsync(byCode)).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(SchemaType.Dto, "String", "DepartmentId", ReferenceRuleCompatibility.TargetSchemaMustBeEntity)]
    [InlineData(SchemaType.Entity, "Boolean", "DepartmentId", ReferenceRuleCompatibility.SourceFieldNotSupported)]
    [InlineData(SchemaType.Entity, "String", "Unknown", ReferenceRuleCompatibility.SourceFieldMustExist)]
    public async Task Create_Reference_Refused(SchemaType targetType, string sourceType, string fieldName, string code)
    {
        SetupReference(Department(targetType), sourceType);
        var v = new CreateDataValidationRequestValidator(_repo.Object);

        var result = await v.ValidateAsync(ReferenceRequest(fieldName));

        result.Errors.Select(e => e.ErrorMessage).Should().ContainSingle().Which.Should().Be(code);
    }

    [Fact]
    public async Task Create_Reference_MissingTargetOrSecondReference_Refused()
    {
        SetupReference(null);
        var v = new CreateDataValidationRequestValidator(_repo.Object);
        (await v.ValidateAsync(ReferenceRequest())).Errors.Should().ContainSingle()
            .Which.ErrorMessage.Should().Be(ReferenceRuleCompatibility.TargetSchemaMustBeEntity);

        SetupReference(Department());
        var twice = ReferenceRequest("DepartmentId", new ValidationRuleRequest { Type = ValidationType.Reference, Value = "Department" });
        (await v.ValidateAsync(twice)).Errors.Should().ContainSingle()
            .Which.ErrorMessage.Should().Be(ReferenceRuleCompatibility.OnlyOneReference);
    }

    private CreateDataValidationRequestValidator VariableValidator()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition
        {
            ItemId = "emp", SchemaName = "Employee", SchemaType = SchemaType.Entity,
            Fields =
            [
                new FieldDefinition { Name = "Name", Type = "String" },
                new FieldDefinition { Name = "StartDate", Type = "DateTime" },
                new FieldDefinition { Name = "EndDate", Type = "DateTime" },
            ],
        });
        return new CreateDataValidationRequestValidator(_repo.Object);
    }

    private static CreateDataValidationRequest VariableRule(object value, ValidationType type = ValidationType.GreaterThan, int version = 1) => new()
    {
        SchemaId = "emp",
        FieldName = "EndDate",
        Validations = [new ValidationRuleRequest { Type = type, Value = value, EvaluationVersion = version }],
    };

    [Fact]
    public async Task Create_VariableRule_Accepted_AndVersionZeroValuesStayFixed()   // UC20
    {
        var v = VariableValidator();

        (await v.ValidateAsync(VariableRule("{{Employee.StartDate}}"))).IsValid.Should().BeTrue();
        (await v.ValidateAsync(VariableRule("{{Auth.UserId}}", version: 0))).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("{{Auth.UserId}}", "Auth values aren't available in validation rules at position 1: use an access policy")]   // UC22
    [InlineData("{{StartDate}}", "Missing prefix at position 1: write {{Employee.StartDate}}")]                                  // UC23
    [InlineData("Hi {{Employee.StartDate}}", "A validation value is either a fixed value or one variable, e.g. {{Employee.StartDate}}")]
    [InlineData("{{Employee.Name}}", "Employee.Name is text at position 1: a date-time is expected")]
    [InlineData("{{Employee.Xyzzy}}", "Unknown property \"Employee.Xyzzy\" at position 1")]
    public async Task Create_VariableRule_Refused_WithTheReason(string value, string expected)
    {
        var result = await VariableValidator().ValidateAsync(VariableRule(value));

        result.Errors.Select(e => e.ErrorMessage).Should().ContainSingle().Which.Should().Be(expected);
    }

    [Fact]
    public async Task Update_MissingItemId_Fails()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), "")).ReturnsAsync(new SchemaDefinition { ItemId = "s1" });
        var v = new UpdateDataValidationRequestValidator(_repo.Object);
        var result = await v.ValidateAsync(new UpdateDataValidationRequest
        {
            ItemId = "",
            SchemaId = "s1",
            FieldName = "Email",
            Validations = new() { new ValidationRuleRequest { Type = ValidationType.NotEmpty } }
        });
        result.IsValid.Should().BeFalse();
    }
}
