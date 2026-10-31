using System.Text.Json;
using Blocks.Data.Api.Filters;
using DomainService.Storage.Dms;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Storage.Validators;

namespace XUnitTest.Api.Filters;

/// <summary>
/// The filter runs whatever <see cref="IValidator{T}"/> is registered for an action argument
/// and answers 400 before the action runs when it fails. Real validators are used so the
/// errors map is the one a client would see.
/// </summary>
public class ValidateRequestAttributeTests
{
    private static ActionExecutingContext Context(params object?[] arguments)
    {
        var services = new ServiceCollection();
        services.AddTransient<IValidator<RenameFileRequest>, RenameFileRequestValidator>();

        var httpContext = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var actionArguments = arguments
            .Select((value, index) => (Key: $"arg{index}", Value: value))
            .ToDictionary(a => a.Key, a => a.Value);

        return new ActionExecutingContext(actionContext, new List<IFilterMetadata>(), actionArguments, controller: new object());
    }

    private static async Task<bool> RunAsync(ActionExecutingContext context)
    {
        var actionRan = false;
        await new ValidateRequestAttribute().OnActionExecutionAsync(context, () =>
        {
            actionRan = true;
            return Task.FromResult(new ActionExecutedContext(context, new List<IFilterMetadata>(), context.Controller));
        });
        return actionRan;
    }

    [Fact]
    public async Task An_invalid_request_is_answered_with_400_and_an_errors_map_before_the_action_runs()
    {
        var context = Context(new RenameFileRequest { FileId = "", Name = "report.pdf" });

        var actionRan = await RunAsync(context);

        actionRan.Should().BeFalse();
        var badRequest = context.Result.Should().BeOfType<BadRequestObjectResult>().Subject;
        using var body = JsonDocument.Parse(JsonSerializer.Serialize(badRequest.Value));
        body.RootElement.GetProperty("message").GetString().Should().NotBeNullOrWhiteSpace();
        body.RootElement.GetProperty("errors").GetProperty(nameof(RenameFileRequest.FileId)).GetString()
            .Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task A_valid_request_reaches_the_action()
    {
        var context = Context(new RenameFileRequest { FileId = "file-1", Name = "report.pdf" });

        var actionRan = await RunAsync(context);

        actionRan.Should().BeTrue();
        context.Result.Should().BeNull();
    }

    [Fact]
    public async Task An_argument_without_a_registered_validator_reaches_the_action()
    {
        var context = Context("dir-1", new DeleteDirectoryRequest());

        (await RunAsync(context)).Should().BeTrue();
    }

    [Fact]
    public async Task A_null_argument_is_left_to_the_action()
    {
        var context = Context((object?)null);

        (await RunAsync(context)).Should().BeTrue();
    }
}
