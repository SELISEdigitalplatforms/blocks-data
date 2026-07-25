using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using MongoDB.Driver;
using Moq;

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
    public void ConfigureSecurity_MissingSchemaId_Fails()
    {
        var v = new ConfigureSchemaSecurityRequestValidator();
        v.Validate(new ConfigureSchemaSecurityRequest { SchemaId = "" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateDataSource_Valid_Passes()
    {
        var v = new CreateDataSourceRequestValidator();
        v.Validate(new CreateDataGatewayConfigurationRequest { ConnectionString = "c", DatabaseName = "d", ProjectKey = "p" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateDataSource_Missing_Fails()
    {
        var v = new CreateDataSourceRequestValidator();
        v.Validate(new CreateDataGatewayConfigurationRequest()).IsValid.Should().BeFalse();
    }

    [Fact]
    public void UpdateDataSource_Valid_Passes()
    {
        var v = new UpdateDataSourceRequestValidator();
        v.Validate(new UpdateDataGatewayConfigurationRequest { ItemId = "1", ConnectionString = "c", DatabaseName = "d", ProjectKey = "p" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateDataSource_MissingItemId_Fails()
    {
        var v = new UpdateDataSourceRequestValidator();
        v.Validate(new UpdateDataGatewayConfigurationRequest { ConnectionString = "c", DatabaseName = "d", ProjectKey = "p" }).IsValid.Should().BeFalse();
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
