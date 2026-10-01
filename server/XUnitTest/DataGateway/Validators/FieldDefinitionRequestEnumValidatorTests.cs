using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using MongoDB.Driver;
using Moq;

namespace XUnitTest.DataGateway.Validators;

/// <summary>SPEC #353 C1/C2 — EnumValues FluentValidation.</summary>
public class FieldDefinitionRequestEnumValidatorTests
{
    private static FieldDefinitionRequestValidator CreateValidator()
    {
        var repo = new Mock<IDbRepository>();
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<FilterDefinition<SchemaDefinition>>(), ""))
            .ReturnsAsync((SchemaDefinition?)null);
        return new FieldDefinitionRequestValidator(repo.Object);
    }

    [Fact]
    public async Task Enum_WithoutValues_IsRejected()
    {
        var v = CreateValidator();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "status",
            Type = "Enum",
            EnumValues = []
        });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Field_EnumValues_Is_Required.");
    }

    [Fact]
    public async Task NonEnum_WithValues_IsRejected()
    {
        var v = CreateValidator();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "status",
            Type = "String",
            EnumValues = ["Active"]
        });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Field_EnumValues_Not_Allowed_For_Non_Enum_Type.");
    }

    [Fact]
    public async Task Enum_WithSpaceInValue_IsRejected()
    {
        var v = CreateValidator();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "priority",
            Type = "Enum",
            EnumValues = ["High", "Not Set"]
        });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e =>
            e.ErrorMessage == "Field_EnumValues_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.");
    }

    [Fact]
    public async Task Enum_WithDuplicate_IsRejected()
    {
        var v = CreateValidator();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "status",
            Type = "Enum",
            EnumValues = ["Active", "Active"]
        });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Field_EnumValues_Must_Be_Unique.");
    }

    [Fact]
    public async Task Enum_With101Values_IsRejected()
    {
        var v = CreateValidator();
        var values = Enumerable.Range(0, 101).Select(i => $"V{i}").ToList();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "status",
            Type = "Enum",
            EnumValues = values
        });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Field_EnumValues_Must_Not_Exceed_100_Values.");
    }

    [Fact]
    public async Task Enum_WithValidValues_IsAccepted()
    {
        var v = CreateValidator();
        var result = await v.ValidateAsync(new FieldDefinitionRequest
        {
            Name = "status",
            Type = "Enum",
            EnumValues = ["Active", "Inactive", "Pending"]
        });
        result.IsValid.Should().BeTrue();
    }
}
