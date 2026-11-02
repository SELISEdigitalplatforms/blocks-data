using System.Diagnostics;
using System.Text.Json;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Parsing;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// Every failure becomes one problem body (spec §6.8): the gateway's own codes keep their meaning, a request the REST
/// layer cannot read is a 400, and anything unexpected is a 500 that says nothing about what went wrong inside.
/// </summary>
public class GatewayProblemMapperTests
{
    private static DefaultHttpContext Http() => new() { TraceIdentifier = "trace-from-http" };

    private static GatewayProblem Problem(RestResult result) => result.Body.Should().BeOfType<GatewayProblem>().Subject;

    private static JsonElement Serialised(RestResult result) =>
        JsonSerializer.SerializeToElement(result.Body, result.Body!.GetType());

    [Theory]
    [InlineData("AUTH_NOT_AUTHENTICATED", 401)]
    [InlineData("FORBIDDEN", 403)]
    [InlineData("NOT_FOUND", 404)]
    [InlineData("VALIDATION_ERROR", 400)]
    public void GatewayException_CodeMapsToStatus(string code, int status)
    {
        var result = GatewayProblemMapper.Map(new GatewayException(code, "The reason."), Http());

        result.StatusCode.Should().Be(status);
        var problem = Problem(result);
        problem.Status.Should().Be(status);
        problem.Code.Should().Be(code);
        problem.Detail.Should().Be("The reason.");
        problem.Errors.Should().BeNull();
    }

    [Fact]
    public void GatewayException_UnknownCode_Is500()
    {
        var result = GatewayProblemMapper.Map(new GatewayException("SOMETHING_ELSE", "internal detail"), Http());

        result.StatusCode.Should().Be(500);
        Problem(result).Code.Should().Be("INTERNAL_ERROR");
        Serialised(result).GetRawText().Should().NotContain("internal detail");
    }

    [Fact]
    public void ValidationError_EveryFieldErrorUnique_Is409()
    {
        var ex = new GatewayException("VALIDATION_ERROR", "Duplicate.",
        [
            new GatewayFieldError("Title", "A record with the same value for 'Title' already exists.", "Unique"),
            new GatewayFieldError("Code", "A record with the same value for 'Code' already exists.", "Unique"),
        ]);

        var result = GatewayProblemMapper.Map(ex, Http());

        result.StatusCode.Should().Be(409);
        Problem(result).Code.Should().Be("VALIDATION_ERROR");
        Problem(result).Errors.Should().HaveCount(2);
    }

    [Fact]
    public void ValidationError_MixedFieldErrors_Is400()
    {
        var ex = new GatewayException("VALIDATION_ERROR", "Invalid.",
        [
            new GatewayFieldError("Title", "Duplicate.", "Unique"),
            new GatewayFieldError("Price", "Too small.", "Min"),
        ]);

        GatewayProblemMapper.Map(ex, Http()).StatusCode.Should().Be(400);
    }

    [Fact]
    public void FieldErrors_SerialiseAsObjects()
    {
        var ex = new GatewayException("VALIDATION_ERROR", "Invalid.", [new GatewayFieldError("Title", "Required.", "NotEmpty")]);

        var json = Serialised(GatewayProblemMapper.Map(ex, Http()));

        var error = json.GetProperty("errors")[0];
        error.ValueKind.Should().Be(JsonValueKind.Object);
        error.GetProperty("field").GetString().Should().Be("Title");
        error.GetProperty("message").GetString().Should().Be("Required.");
        error.GetProperty("validationType").GetString().Should().Be("NotEmpty");
    }

    [Fact]
    public void Body_HasProblemMembers_AndOmitsNullErrors()
    {
        var json = Serialised(GatewayProblemMapper.Map(new GatewayException("FORBIDDEN", "No."), Http()));

        json.GetProperty("type").GetString().Should().NotBeNullOrEmpty();
        json.GetProperty("title").GetString().Should().Be("Forbidden");
        json.GetProperty("status").GetInt32().Should().Be(403);
        json.GetProperty("code").GetString().Should().Be("FORBIDDEN");
        json.GetProperty("detail").GetString().Should().Be("No.");
        json.TryGetProperty("errors", out _).Should().BeFalse();
        json.TryGetProperty("traceId", out _).Should().BeTrue();
    }

    [Fact]
    public void RestRequestException_Is400WithItsFieldErrors()
    {
        var ex = new RestRequestException("Unknown field 'Nme'.", [new GatewayFieldError("Nme", "Unknown field 'Nme'.", "UnknownField")]);

        var result = GatewayProblemMapper.Map(ex, Http());

        result.StatusCode.Should().Be(400);
        Problem(result).Code.Should().Be("VALIDATION_ERROR");
        Problem(result).Detail.Should().Be("Unknown field 'Nme'.");
        Problem(result).Errors.Should().ContainSingle().Which.Field.Should().Be("Nme");
    }

    [Fact]
    public void JsonException_Is400()
    {
        var result = GatewayProblemMapper.Map(new JsonException("'x' is an invalid start of a value."), Http());

        result.StatusCode.Should().Be(400);
        Problem(result).Code.Should().Be("VALIDATION_ERROR");
    }

    [Fact]
    public void InvalidOperationException_FromReadingJson_Is400()
    {
        InvalidOperationException? thrown = null;
        try
        {
            // Reading a number as a string: System.Text.Json throws InvalidOperationException.
            JsonDocument.Parse("1").RootElement.GetString();
        }
        catch (InvalidOperationException ex)
        {
            thrown = ex;
        }

        var result = GatewayProblemMapper.Map(thrown!, Http());

        result.StatusCode.Should().Be(400);
        Problem(result).Code.Should().Be("VALIDATION_ERROR");
    }

    [Fact]
    public void InvalidOperationException_FromElsewhere_Is500()
    {
        var result = GatewayProblemMapper.Map(new InvalidOperationException("No event publisher is registered."), Http());

        result.StatusCode.Should().Be(500);
    }

    [Fact]
    public void InvalidWhereFilterException_Is400()
    {
        var result = GatewayProblemMapper.Map(new InvalidWhereFilterException("'or' must be a list."), Http());

        result.StatusCode.Should().Be(400);
        Problem(result).Detail.Should().Be("'or' must be a list.");
    }

    [Fact]
    public void ArgumentException_FromTheSortConverter_Is400()
    {
        var schema = Schema(fields: [Field("Name")]);
        ArgumentException? thrown = null;
        try
        {
            IReadOnlyList<OrderItem> order = [new OrderItem("Missing", SortDirection.ASC)];
            OrderToMongoSortConverter.Convert(order, schema);
        }
        catch (ArgumentException ex)
        {
            thrown = ex;
        }

        thrown.Should().NotBeNull();
        var result = GatewayProblemMapper.Map(thrown!, Http());

        result.StatusCode.Should().Be(400);
        Problem(result).Detail.Should().Be(thrown!.Message);
    }

    [Fact]
    public void ArgumentException_FromElsewhere_Is500WithoutItsMessage()
    {
        var result = GatewayProblemMapper.Map(new ArgumentNullException("connectionString", "secret value"), Http());

        result.StatusCode.Should().Be(500);
        Serialised(result).GetRawText().Should().NotContain("secret value").And.NotContain("connectionString");
    }

    [Fact]
    public void Unhandled_Is500_WithGenericDetailAndNoExceptionText()
    {
        var result = GatewayProblemMapper.Map(new Exception("mongodb://user:pa55@host failed at Foo.Bar()"), Http());

        result.StatusCode.Should().Be(500);
        var problem = Problem(result);
        problem.Code.Should().Be("INTERNAL_ERROR");
        problem.Detail.Should().NotBeNullOrWhiteSpace();
        var raw = Serialised(result).GetRawText();
        raw.Should().NotContain("pa55").And.NotContain("Foo.Bar");
    }

    [Fact]
    public void TraceId_FromCurrentActivity()
    {
        using var activity = new Activity("test").SetIdFormat(ActivityIdFormat.W3C).Start();

        var problem = Problem(GatewayProblemMapper.Map(new GatewayException("FORBIDDEN", "No."), Http()));

        problem.TraceId.Should().Be(activity.TraceId.ToString());
    }

    [Fact]
    public void TraceId_WithoutActivity_FromHttpContext()
    {
        var previous = Activity.Current;
        Activity.Current = null;
        try
        {
            var problem = Problem(GatewayProblemMapper.Map(new GatewayException("FORBIDDEN", "No."), Http()));

            problem.TraceId.Should().Be("trace-from-http");
        }
        finally
        {
            Activity.Current = previous;
        }
    }
}
