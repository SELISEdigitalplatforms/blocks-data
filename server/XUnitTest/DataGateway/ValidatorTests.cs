using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation;
using MongoDB.Driver;
using Moq;

namespace XUnitTest.DataGateway;

public class ValidatorTests
{
    private static PolicyRuleGroup ValidRuleGroup() => new()
    {
        LogicalOperator = PolicyLogicalOperator.AND,
        Rules = new List<PolicyRule>
        {
            new() { LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "CreatedBy", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE }
        }
    };

    [Fact]
    public void CreateDataAccessPolicy_Valid_Passes()
    {
        var validator = new CreateDataAccessPolicyRequestValidator();
        var request = new CreateDataAccessPolicyRequest
        {
            PolicyName = "P1",
            PolicyType = PolicyType.RLS,
            Operation = PolicyOperation.READ,
            SchemaName = "Person",
            SchemaId = "id-1",
            FieldNames = Array.Empty<string>(),
            RuleGroup = ValidRuleGroup()
        };
        validator.Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateDataAccessPolicy_EmptyName_Fails()
    {
        var validator = new CreateDataAccessPolicyRequestValidator();
        var request = new CreateDataAccessPolicyRequest
        {
            PolicyName = "",
            SchemaName = "Person",
            SchemaId = "id-1",
            RuleGroup = ValidRuleGroup()
        };
        var result = validator.Validate(request);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "PolicyName");
    }

    [Fact]
    public void CreateDataAccessPolicy_ClsWithoutFieldNames_Fails()
    {
        var validator = new CreateDataAccessPolicyRequestValidator();
        var request = new CreateDataAccessPolicyRequest
        {
            PolicyName = "P1",
            PolicyType = PolicyType.CLS,
            SchemaName = "Person",
            SchemaId = "id-1",
            FieldNames = Array.Empty<string>(),
            RuleGroup = ValidRuleGroup()
        };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateDataAccessPolicy_ClsWithFieldNames_Passes()
    {
        var validator = new CreateDataAccessPolicyRequestValidator();
        var request = new CreateDataAccessPolicyRequest
        {
            PolicyName = "P1",
            PolicyType = PolicyType.CLS,
            SchemaName = "Person",
            SchemaId = "id-1",
            FieldNames = new[] { "Salary" },
            RuleGroup = ValidRuleGroup()
        };
        validator.Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void PolicyRuleValidator_EmptyLeftOperand_Fails()
    {
        var validator = new PolicyRuleValidator();
        var rule = new PolicyRule { LeftOperand = "", Operator = PolicyOperator.EQUAL };
        validator.Validate(rule).IsValid.Should().BeFalse();
    }

    [Fact]
    public void PolicyRuleValidator_Valid_Passes()
    {
        var validator = new PolicyRuleValidator();
        var rule = new PolicyRule { LeftOperand = "Field", Operator = PolicyOperator.EQUAL };
        validator.Validate(rule).IsValid.Should().BeTrue();
    }

    [Fact]
    public void PolicyRuleGroupValidator_NestedInvalidRule_Fails()
    {
        var validator = new PolicyRuleGroupValidator();
        var group = new PolicyRuleGroup
        {
            Rules = new List<PolicyRule> { new() { LeftOperand = "OK" } },
            NestedGroups = new List<PolicyRuleGroup>
            {
                new() { Rules = new List<PolicyRule> { new() { LeftOperand = "" } } } // invalid
            }
        };
        validator.Validate(group).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidationRuleRequest_Range_RequiresSecondaryValue()
    {
        var validator = new ValidationRuleRequestValidator();
        var invalid = new ValidationRuleRequest { Type = ValidationType.Range, Value = 1, SecondaryValue = null };
        validator.Validate(invalid).IsValid.Should().BeFalse();

        var valid = new ValidationRuleRequest { Type = ValidationType.Range, Value = 1, SecondaryValue = 10 };
        validator.Validate(valid).IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidationRuleRequest_NonNotEmpty_RequiresValue()
    {
        var validator = new ValidationRuleRequestValidator();
        var invalid = new ValidationRuleRequest { Type = ValidationType.MinLength, Value = null };
        validator.Validate(invalid).IsValid.Should().BeFalse();

        var notEmpty = new ValidationRuleRequest { Type = ValidationType.NotEmpty, Value = null };
        validator.Validate(notEmpty).IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateSchemaDefinition_Valid_Passes()
    {
        var repo = new Mock<IDbRepository>();
        var validator = new CreateSchemaDefinitionRequestValidator(repo.Object);
        var request = new CreateSchemaDefinitionRequest
        {
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new List<FieldDefinitionRequest>
            {
                new() { Name = "Name", Type = "String" }
            }
        };
        validator.Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateSchemaDefinition_InvalidSchemaName_Fails()
    {
        var repo = new Mock<IDbRepository>();
        var validator = new CreateSchemaDefinitionRequestValidator(repo.Object);
        var request = new CreateSchemaDefinitionRequest
        {
            SchemaName = "123-bad",  // starts with number
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new List<FieldDefinitionRequest> { new() { Name = "Name", Type = "String" } }
        };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void CreateSchemaDefinition_DuplicateFields_Fails()
    {
        var repo = new Mock<IDbRepository>();
        var validator = new CreateSchemaDefinitionRequestValidator(repo.Object);
        var request = new CreateSchemaDefinitionRequest
        {
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new List<FieldDefinitionRequest>
            {
                new() { Name = "Name", Type = "String" },
                new() { Name = "Name", Type = "String" }
            }
        };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void FieldDefinition_ScalarType_Passes()
    {
        var repo = new Mock<IDbRepository>();
        var validator = new FieldDefinitionRequestValidator(repo.Object);
        validator.Validate(new FieldDefinitionRequest { Name = "Age", Type = "Int" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void FieldDefinition_CustomType_ResolvedViaRepository_Passes()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync(new SchemaDefinition { SchemaName = "Address" });
        var validator = new FieldDefinitionRequestValidator(repo.Object);
        validator.Validate(new FieldDefinitionRequest { Name = "Home", Type = "Address" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void FieldDefinition_UnknownCustomType_Fails()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync((SchemaDefinition?)null);
        var validator = new FieldDefinitionRequestValidator(repo.Object);
        validator.Validate(new FieldDefinitionRequest { Name = "Home", Type = "GhostType" }).IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task CreateDataValidation_MissingSchema_Fails()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync((SchemaDefinition?)null);
        var validator = new CreateDataValidationRequestValidator(repo.Object);
        var request = new CreateDataValidationRequest
        {
            SchemaId = "nonexistent",
            FieldName = "Name",
            Validations = new List<ValidationRuleRequest> { new() { Type = ValidationType.NotEmpty } }
        };
        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task CreateDataValidation_Valid_Passes()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), It.IsAny<string>()))
            .ReturnsAsync(new SchemaDefinition { ItemId = "id-1" });
        var validator = new CreateDataValidationRequestValidator(repo.Object);
        var request = new CreateDataValidationRequest
        {
            SchemaId = "id-1",
            FieldName = "Name",
            Validations = new List<ValidationRuleRequest> { new() { Type = ValidationType.NotEmpty } }
        };
        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeTrue();
    }
}

public class RequestValidatorTests
{
    [Fact]
    public void Validate_ResolvesValidatorAndValidates()
    {
        var provider = new Mock<IServiceProvider>();
        provider.Setup(p => p.GetService(typeof(IValidator<CreateDataAccessPolicyRequest>)))
            .Returns(new CreateDataAccessPolicyRequestValidator());

        var sut = new RequestValidator(provider.Object);
        var result = sut.Validate(new CreateDataAccessPolicyRequest { PolicyName = "" });
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_NoValidatorRegistered_Throws()
    {
        var provider = new Mock<IServiceProvider>();
        provider.Setup(p => p.GetService(It.IsAny<Type>())).Returns(null!);
        var sut = new RequestValidator(provider.Object);
        var act = () => sut.Validate(new CreateDataAccessPolicyRequest());
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public async Task ValidateAsync_ResolvesAndValidates()
    {
        var provider = new Mock<IServiceProvider>();
        provider.Setup(p => p.GetService(typeof(IValidator<CreateDataAccessPolicyRequest>)))
            .Returns(new CreateDataAccessPolicyRequestValidator());
        var sut = new RequestValidator(provider.Object);
        var result = await sut.ValidateAsync(new CreateDataAccessPolicyRequest { PolicyName = "" });
        result.IsValid.Should().BeFalse();
    }
}
