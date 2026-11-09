using System.Text.Json;
using Blocks.Genesis.DataAccess.Rules;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using FluentAssertions;
using HotChocolate;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// A <see cref="GatewayException"/> is GraphQL-free; the GraphQL layer turns it into a
/// <see cref="GraphQLException"/> with the same code, message and (for validation) the same
/// <c>validationErrors</c> extension the mutation validation helper has always produced.
/// </summary>
public class GatewayExceptionTranslationTests
{
    [Fact]
    public void ToGraphQLException_KeepsCodeAndMessage()
    {
        var ex = new GatewayException("FORBIDDEN", "no");

        var graphQlException = ex.ToGraphQLException();

        graphQlException.Errors.Should().HaveCount(1);
        graphQlException.Errors[0].Code.Should().Be("FORBIDDEN");
        graphQlException.Errors[0].Message.Should().Be("no");
        graphQlException.Errors[0].Extensions.Should().NotContainKey("validationErrors");
    }

    [Fact]
    public void ToGraphQLException_WithFieldErrors_AddsValidationErrorsExtension()
    {
        var validationResult = new DataValidationResult();
        validationResult.AddError("Name", "Name is required.", "Required");
        validationResult.AddError("Age", "Age must be positive.", "Range");

        var expected = Capture(() => MutationValidationHelper.ThrowValidationError(validationResult));
        var fieldErrors = validationResult.Errors
            .Select(e => new GatewayFieldError(e.FieldName, e.Message, e.ValidationType))
            .ToList();

        var actual = new GatewayException(
            expected.Errors[0].Code!, expected.Errors[0].Message, fieldErrors).ToGraphQLException();

        actual.Errors[0].Code.Should().Be(expected.Errors[0].Code);
        actual.Errors[0].Message.Should().Be(expected.Errors[0].Message);
        actual.Errors[0].Extensions.Should().ContainKey("validationErrors");
        JsonSerializer.Serialize(actual.Errors[0].Extensions!["validationErrors"])
            .Should().Be(JsonSerializer.Serialize(expected.Errors[0].Extensions!["validationErrors"]));
    }

    [Fact]
    public async Task TranslateAsync_GatewayException_BecomesGraphQLException()
    {
        var act = () => GatewayExceptionTranslation.TranslateAsync<int>(
            () => throw new GatewayException("NOT_FOUND", "missing"));

        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors[0];
        error.Code.Should().Be("NOT_FOUND");
        error.Message.Should().Be("missing");
    }

    [Fact]
    public async Task TranslateAsync_OtherExceptions_PassThrough()
    {
        var act = () => GatewayExceptionTranslation.TranslateAsync<int>(
            () => throw new InvalidCastException("boom"));

        await act.Should().ThrowAsync<InvalidCastException>().WithMessage("boom");
    }

    [Fact]
    public async Task TranslateAsync_ReturnsTheResultWhenNothingIsThrown()
    {
        var result = await GatewayExceptionTranslation.TranslateAsync(() => Task.FromResult(42));

        result.Should().Be(42);
    }

    private static GraphQLException Capture(Action action)
    {
        try
        {
            action();
        }
        catch (GraphQLException ex)
        {
            return ex;
        }

        throw new InvalidOperationException("Expected a GraphQLException.");
    }
}
