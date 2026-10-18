using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;
using Blocks.Genesis.DataAccess.Rules;

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
        var result = new DataValidationResult();
        result.AddError("A", "err-a", "NotEmpty");
        result.AddError("B", "err-b", "NotEmpty");
        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("err-a").And.Contain("err-b");
    }

    /// <summary>A list property whose rules were saved with EvaluationVersion 1 (item by item).</summary>
    private static FieldDefinitionResponse ListField(string name, string type, params ValidationRule[] rules)
    {
        foreach (var rule in rules) rule.EvaluationVersion = 1;
        var f = FieldWithValidations(name, type, rules);
        f.IsArray = true;
        return f;
    }

    [Fact]
    public void Validate_PrimitiveList_VersionZeroRule_KeepsCheckingTheListAsAWhole()
    {
        // Rules saved before EvaluationVersion existed must behave exactly as in production today:
        // the list is checked as its text ("System.Collections.Generic.List`1[...]"), not item by item.
        var legacy = new ValidationRule { Type = ValidationType.MaxLength, Value = 50 };
        var field = FieldWithValidations("Tags", "String", legacy);
        field.IsArray = true;
        var schema = Schema(fields: new() { field });
        var longTag = new string('x', 60);

        new Dictionary<string, object?> { ["Tags"] = new List<object?> { longTag } }.Validate(schema).IsValid
            .Should().BeTrue("the list's text is shorter than 50, which is what a version-0 rule has always measured");

        var notEmpty = FieldWithValidations("Labels", "String", new ValidationRule { Type = ValidationType.NotEmpty });
        notEmpty.IsArray = true;
        new Dictionary<string, object?> { ["Labels"] = new List<object?>() }.Validate(Schema(fields: new() { notEmpty })).IsValid
            .Should().BeTrue("an empty list has never failed a version-0 Not empty rule");
    }

    [Fact]
    public void Validate_PrimitiveList_ChecksEachElement()
    {
        var schema = Schema(fields: new() { ListField("Tags", "String", V(ValidationType.MaxLength, 5)) });
        var input = new Dictionary<string, object?> { ["Tags"] = new List<object?> { "ok", "waytoolong", null, "fine" } };

        var result = input.Validate(schema);

        // Only the long element fails; null elements are skipped.
        result.Errors.Should().ContainSingle();
        result.Errors[0].FieldName.Should().Be("Tags[1]");
        result.Errors[0].ValidationType.Should().Be(nameof(ValidationType.MaxLength));
    }

    [Fact]
    public void Validate_PrimitiveList_NotEmpty_MeansAtLeastOneItem()
    {
        var schema = Schema(fields: new() { ListField("Tags", "String", V(ValidationType.NotEmpty, msg: "Add a tag")) });

        new Dictionary<string, object?> { ["Tags"] = new List<object?>() }.Validate(schema).Errors
            .Should().ContainSingle().Which.Message.Should().Be("Add a tag");
        new Dictionary<string, object?> { ["Tags"] = new List<object?> { "a" } }.Validate(schema).IsValid.Should().BeTrue();
        new Dictionary<string, object?> { ["Tags"] = null }.Validate(schema).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_PrimitiveList_RangeOnNumbers()
    {
        var schema = Schema(fields: new() { ListField("Scores", "Int", V(ValidationType.Range, 1, 10)) });
        var input = new Dictionary<string, object?> { ["Scores"] = new List<object?> { 1, 11, 5 } };

        input.Validate(schema).Errors.Should().ContainSingle().Which.FieldName.Should().Be("Scores[1]");
    }

    [Fact]
    public void Validate_Reference_IsLeftToTheMutationStep()
    {
        // The existence check needs the target's data, so this synchronous pass never fails on it.
        var schema = Schema(fields: new() { FieldWithValidations("DepartmentId", "String", V(ValidationType.Reference, "Department", "ItemId")) });

        new Dictionary<string, object?> { ["DepartmentId"] = "does-not-exist" }.Validate(schema).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_SeveralBrokenRules_AreAllReportedTogether()
    {
        var schema = Schema(fields: new()
        {
            FieldWithValidations("Username", "String",
                V(ValidationType.MinLength, 3), V(ValidationType.MaxLength, 20), V(ValidationType.Regex, "^[a-z0-9_]+$")),
        });

        var result = new Dictionary<string, object?> { ["Username"] = "Ab" }.Validate(schema);

        result.Errors.Select(e => e.ValidationType).Should().BeEquivalentTo(
            [nameof(ValidationType.MinLength), nameof(ValidationType.Regex)]);
    }
}
