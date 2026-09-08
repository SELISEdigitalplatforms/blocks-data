using DataGateway.DomainService.Models;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using SortDirection = DataGateway.DomainService.Models.SortDirection;

namespace XUnitTest.DataGateway.Validators;

public class CreateSchemaIndexRequestValidatorTests
{
    private readonly CreateSchemaIndexRequestValidator _validator = new();

    [Fact]
    public void Valid_SingleField_Passes()
    {
        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new() { new IndexFieldRequest { FieldName = "email", Direction = SortDirection.ASC } }
        });

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void MissingSchemaDefinitionItemId_Fails()
    {
        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "",
            Fields = new() { new IndexFieldRequest { FieldName = "email" } }
        });

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ZeroFields_FailsWithInvalidIndexFields()
    {
        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new()
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "INVALID_INDEX_FIELDS");
    }

    [Fact]
    public void MoreThanTenFields_FailsWithInvalidIndexFields()
    {
        var fields = Enumerable.Range(0, 11).Select(i => new IndexFieldRequest { FieldName = $"f{i}" }).ToList();

        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = fields
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "INVALID_INDEX_FIELDS");
    }

    [Fact]
    public void DuplicateFieldNameWithinRequest_FailsWithInvalidIndexFields()
    {
        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = new()
            {
                new IndexFieldRequest { FieldName = "email" },
                new IndexFieldRequest { FieldName = "email" },
            }
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "INVALID_INDEX_FIELDS");
    }

    [Fact]
    public void TenFields_IsAtTheAllowedMax_Passes()
    {
        var fields = Enumerable.Range(0, 10).Select(i => new IndexFieldRequest { FieldName = $"f{i}" }).ToList();

        var result = _validator.Validate(new CreateSchemaIndexRequest
        {
            SchemaDefinitionItemId = "schema-1",
            Fields = fields
        });

        result.IsValid.Should().BeTrue();
    }
}
