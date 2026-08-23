using System.Reflection;
using System.Collections;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;

namespace XUnitTest.DataGateway;

public class RequiredFieldValidationTests
{
    private static readonly MethodInfo ValidateMethod = typeof(MutationService).GetMethod(
        "ValidateRequiredFieldsOrThrow",
        BindingFlags.NonPublic | BindingFlags.Static)!;

    private static SchemaDefinitionExtended Schema(RequiredOn requiredOn) => new()
    {
        SchemaType = SchemaType.Entity,
        Fields =
        [
            new FieldDefinitionResponse
            {
                Name = "Address",
                Type = "Address",
                Fields =
                [
                    new FieldDefinitionResponse
                    {
                        Name = "HouseNo",
                        Type = "Int",
                        RequiredOn = requiredOn
                    }
                ]
            }
        ]
    };

    private static Action Validate(Dictionary<string, object?> input, RequiredOn requiredOn, string operation) =>
        () => ValidateMethod.Invoke(null, [input, Schema(requiredOn), operation]);

    [Theory]
    [InlineData("CREATE", RequiredOn.Insert)]
    [InlineData("UPDATE", RequiredOn.Update)]
    [InlineData("CREATE", RequiredOn.Both)]
    [InlineData("UPDATE", RequiredOn.Both)]
    public void NestedRequiredField_Missing_ProducesPathError(string operation, RequiredOn requiredOn)
    {
        var action = Validate(new Dictionary<string, object?>(), requiredOn, operation);

        var exception = action.Should().Throw<TargetInvocationException>().Which.InnerException;
        exception.Should().BeOfType<GraphQLException>();
        var error = ((GraphQLException)exception!).Errors.Single();
        error.Extensions!["validationErrors"].Should().NotBeNull();
        var validationError = ((IEnumerable)error.Extensions["validationErrors"]!).Cast<object>().Single();
        validationError.GetType().GetProperty("field")!.GetValue(validationError)
            .Should().Be("Address.HouseNo");
    }

    [Fact]
    public void NestedRequiredField_Zero_IsAccepted()
    {
        var input = new Dictionary<string, object?>
        {
            ["Address"] = new Dictionary<string, object?> { ["HouseNo"] = 0 }
        };

        Validate(input, RequiredOn.Both, "CREATE").Should().NotThrow();
    }

    [Fact]
    public void NestedRequiredField_InArray_ValidatesEveryItem()
    {
        var input = new Dictionary<string, object?>
        {
            ["Address"] = new List<Dictionary<string, object?>>
            {
                new() { ["HouseNo"] = 12 },
                new()
            }
        };

        Validate(input, RequiredOn.Insert, "CREATE")
            .Should().Throw<TargetInvocationException>();
    }
}
