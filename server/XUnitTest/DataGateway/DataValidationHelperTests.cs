using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class DataValidationHelperTests
{
    private static FieldDefinitionResponse FieldWithValidations(string name, string type, params ValidationRule[] rules)
    {
        var f = Field(name, type);
        f.ValidationRule = new DataValidation { FieldName = name, Validations = rules.ToList() };
        return f;
    }

    private static ValidationRule V(ValidationType type, object? value = null, object? secondary = null, string? msg = null, bool active = true) =>
        new ValidationRule { Type = type, Value = value, SecondaryValue = secondary, ErrorMessage = msg, IsActive = active };

    [Fact]
    public void Validate_NotEmpty_Fails_OnEmpty()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Name", "String", V(ValidationType.NotEmpty, msg: "Name required")) });
        var input = new Dictionary<string, object?> { ["Name"] = "" };
        var result = input.Validate(schema);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle().Which.Message.Should().Be("Name required");
    }

    [Fact]
    public void Validate_NotEmpty_Passes_OnValue()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Name", "String", V(ValidationType.NotEmpty)) });
        var input = new Dictionary<string, object?> { ["Name"] = "John" };
        input.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Regex()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Email", "String", V(ValidationType.Regex, @"^\S+@\S+$")) });
        input("bad").Validate(schema).IsValid.Should().BeFalse();
        input("a@b.com").Validate(schema).IsValid.Should().BeTrue();

        static Dictionary<string, object?> input(string v) => new() { ["Email"] = v };
    }

    [Fact]
    public void Validate_MinLength_MaxLength()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Name", "String", V(ValidationType.MinLength, 3), V(ValidationType.MaxLength, 5))
        });
        new Dictionary<string, object?> { ["Name"] = "ab" }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Name"] = "abcdef" }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Name"] = "abcd" }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_LengthRange()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Code", "String", V(ValidationType.LengthRange, 2, 4)) });
        new Dictionary<string, object?> { ["Code"] = "a" }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Code"] = "abc" }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Numeric_GreaterThan_LessThan()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Age", "Int", V(ValidationType.GreaterThan, 18), V(ValidationType.LessThan, 65))
        });
        new Dictionary<string, object?> { ["Age"] = 10 }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Age"] = 70 }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Age"] = 30 }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Equal_NotEqual()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Status", "String", V(ValidationType.Equal, "active"))
        });
        new Dictionary<string, object?> { ["Status"] = "inactive" }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Status"] = "active" }.Validate(schema).IsValid.Should().BeTrue();

        var schema2 = Schema(fields: new()
        {
            FieldWithValidations("Status", "String", V(ValidationType.NotEqual, "banned"))
        });
        new Dictionary<string, object?> { ["Status"] = "banned" }.Validate(schema2).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_Range_Numeric()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Age", "Int", V(ValidationType.Range, 18, 65))
        });
        new Dictionary<string, object?> { ["Age"] = 5 }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Age"] = 40 }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_InactiveRule_Skipped()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Name", "String", V(ValidationType.NotEmpty, active: false))
        });
        new Dictionary<string, object?> { ["Name"] = "" }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_UnknownField_Skipped()
    {
        var schema = Schema(fields: new() { Field("Name", "String") });
        new Dictionary<string, object?> { ["Ghost"] = "x" }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NestedObject_Recurses()
    {
        var contactField = Field("Contact", "Contact", children: new()
        {
            FieldWithValidations("Email", "String", V(ValidationType.NotEmpty, msg: "Email required"))
        });
        var schema = Schema(fields: new() { contactField });
        var input = new Dictionary<string, object?>
        {
            ["Contact"] = new Dictionary<string, object?> { ["Email"] = "" }
        };
        var result = input.Validate(schema);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Message == "Email required");
    }

    [Fact]
    public void Validate_NestedArray_Recurses()
    {
        var coursesField = Field("Courses", "Course", isArray: true, children: new()
        {
            FieldWithValidations("Title", "String", V(ValidationType.NotEmpty, msg: "Title required"))
        });
        var schema = Schema(fields: new() { coursesField });
        var input = new Dictionary<string, object?>
        {
            ["Courses"] = new List<object?>
            {
                new Dictionary<string, object?> { ["Title"] = "" }
            }
        };
        input.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_NestedObject_NullValue_Skipped()
    {
        var contactField = Field("Contact", "Contact", children: new()
        {
            FieldWithValidations("Email", "String", V(ValidationType.NotEmpty, msg: "Email required"))
        });
        var schema = Schema(fields: new() { contactField });
        var input = new Dictionary<string, object?> { ["Contact"] = null };
        input.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Equal_IntType()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Age", "Int", V(ValidationType.Equal, 5)) });
        new Dictionary<string, object?> { ["Age"] = 5 }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Age"] = 6 }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_Equal_UnconvertibleValue_Fails()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Age", "Int", V(ValidationType.Equal, 5)) });
        new Dictionary<string, object?> { ["Age"] = "not-a-number" }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_Equal_FloatType()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Price", "Float", V(ValidationType.Equal, 1.5)) });
        new Dictionary<string, object?> { ["Price"] = 1.5 }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Equal_DateTimeType()
    {
        var when = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var schema = Schema(fields: new() { FieldWithValidations("When", "DateTime", V(ValidationType.Equal, when)) });
        new Dictionary<string, object?> { ["When"] = when }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_Equal_BooleanType()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Flag", "Boolean", V(ValidationType.Equal, true)) });
        new Dictionary<string, object?> { ["Flag"] = true }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Flag"] = false }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_NotEqual_IntType_Matches_Fails()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Age", "Int", V(ValidationType.NotEqual, 5)) });
        new Dictionary<string, object?> { ["Age"] = 5 }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Age"] = 6 }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_GreaterThanOrEqual_LessThanOrEqual()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Age", "Int", V(ValidationType.GreaterThanOrEqual, 18), V(ValidationType.LessThanOrEqual, 65))
        });
        new Dictionary<string, object?> { ["Age"] = 18 }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Age"] = 65 }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Age"] = 17 }.Validate(schema).IsValid.Should().BeFalse();
        new Dictionary<string, object?> { ["Age"] = 66 }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_Comparison_FloatType()
    {
        var schema = Schema(fields: new() { FieldWithValidations("Price", "Float", V(ValidationType.GreaterThan, 1.0)) });
        new Dictionary<string, object?> { ["Price"] = 2.5 }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Price"] = 0.5 }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_Comparison_DateTimeType()
    {
        var floor = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var schema = Schema(fields: new() { FieldWithValidations("When", "DateTime", V(ValidationType.GreaterThan, floor)) });
        new Dictionary<string, object?> { ["When"] = floor.AddDays(1) }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["When"] = floor.AddDays(-1) }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void DataValidationResult_ErrorMessage_AggregatesErrors()
    {
        var result = new global::DataGateway.DomainService.Models.Responses.DataValidationResult();
        result.AddError("A", "err-a", "NotEmpty");
        result.AddError("B", "err-b", "NotEmpty");
        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("err-a").And.Contain("err-b");
    }
}
