using System.Text.Json;
using Api.Controllers;
using Blocks.Data.Api.Middleware;
using DataGateway.DomainService.Gateway;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace XUnitTest.Api;

/// <summary>
/// What surrounds the controller's actions: the body size limit, and the mapping of everything the framework would
/// otherwise answer in its own shape (model-binding failures, a wrong content type, an unread body, an exception)
/// to the gateway's problem body. All of it applies to this controller only.
/// </summary>
public class DataGatewayRestFilterTests
{
    private sealed class FakeMaxBodySize : IHttpMaxRequestBodySizeFeature
    {
        public bool IsReadOnly { get; init; }
        public long? MaxRequestBodySize { get; set; } = 30_000_000;
    }

    private static DefaultHttpContext Http(long maxBytes = 1000)
    {
        var services = new ServiceCollection();
        services.AddSingleton(Options.Create(new RestLimits { MaxRequestBodyBytes = maxBytes }));
        return new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
    }

    private static ActionContext ActionContextFor(HttpContext http) =>
        new(http, new RouteData(), new ActionDescriptor(), new ModelStateDictionary());

    private static GatewayProblem ProblemOf(IActionResult? result, int status)
    {
        var written = result.Should().BeOfType<ObjectResult>().Subject;
        written.StatusCode.Should().Be(status);
        written.ContentTypes.Should().Equal("application/problem+json");
        return written.Value.Should().BeOfType<GatewayProblem>().Subject;
    }

    // ---- body size limit ----

    [Fact]
    public void SizeLimit_SetsTheKestrelLimitFromTheConfiguredBytes()
    {
        var http = Http(maxBytes: 12345);
        var feature = new FakeMaxBodySize();
        http.Features.Set<IHttpMaxRequestBodySizeFeature>(feature);

        new RestRequestSizeLimitAttribute().OnResourceExecuting(
            new ResourceExecutingContext(ActionContextFor(http), [], []));

        feature.MaxRequestBodySize.Should().Be(12345);
    }

    [Fact]
    public void SizeLimit_LeavesAReadOnlyFeatureAlone()
    {
        var http = Http(maxBytes: 12345);
        var feature = new FakeMaxBodySize { IsReadOnly = true };
        http.Features.Set<IHttpMaxRequestBodySizeFeature>(feature);

        new RestRequestSizeLimitAttribute().OnResourceExecuting(
            new ResourceExecutingContext(ActionContextFor(http), [], []));

        feature.MaxRequestBodySize.Should().Be(30_000_000);
    }

    [Fact]
    public void SizeLimit_WithoutAFeature_DoesNothing()
    {
        var http = Http();

        var act = () => new RestRequestSizeLimitAttribute().OnResourceExecuting(
            new ResourceExecutingContext(ActionContextFor(http), [], []));

        act.Should().NotThrow();
    }

    // ---- model-binding failures ----

    private static ActionExecutingContext Executing(ModelStateDictionary state, HttpContext http) =>
        new(new ActionContext(http, new RouteData(), new ActionDescriptor(), state), [], new Dictionary<string, object?>(), new object());

    [Fact]
    public void ModelState_Valid_RunsTheAction()
    {
        var context = Executing(new ModelStateDictionary(), Http());

        new RestProblemFilterAttribute().OnActionExecuting(context);

        context.Result.Should().BeNull();
    }

    [Fact]
    public void ModelState_Invalid_IsAValidationErrorProblemWithFieldErrors()
    {
        var state = new ModelStateDictionary();
        state.AddModelError("hardDelete", "The value 'zz' is not valid.");
        var context = Executing(state, Http());

        new RestProblemFilterAttribute().OnActionExecuting(context);

        var problem = ProblemOf(context.Result, 400);
        problem.Code.Should().Be("VALIDATION_ERROR");
        problem.Errors.Should().ContainSingle().Which.Should().BeEquivalentTo(
            new GatewayProblemError("hardDelete", "The value 'zz' is not valid.", "InvalidValue"));
        problem.TraceId.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void ModelState_EmptyBody_IsAFieldErrorOnTheBody()
    {
        var state = new ModelStateDictionary();
        state.AddModelError(string.Empty, "A non-empty request body is required.");
        var context = Executing(state, Http());

        new RestProblemFilterAttribute().OnActionExecuting(context);

        var problem = ProblemOf(context.Result, 400);
        problem.Errors.Should().ContainSingle().Which.Field.Should().Be("body");
        problem.Errors![0].Message.Should().Be("A non-empty request body is required.");
    }

    [Fact]
    public void ModelState_MalformedJson_SaysSoWithoutTheParsersText()
    {
        var state = new ModelStateDictionary();
        state.AddModelError("$", new JsonException("'b' is an invalid start of a property name. Path: $ | LineNumber: 0"), new EmptyModelMetadataProvider().GetMetadataForType(typeof(JsonElement)));
        var context = Executing(state, Http());

        new RestProblemFilterAttribute().OnActionExecuting(context);

        var problem = ProblemOf(context.Result, 400);
        problem.Errors.Should().ContainSingle().Which.Field.Should().Be("body");
        problem.Errors![0].Message.Should().Be("The request body is not valid JSON.");
        problem.Detail.Should().NotContain("LineNumber");
    }

    [Fact]
    public void ModelState_MalformedJsonAsTheInputFormatterReportsIt_SaysSoWithoutTheParsersText()
    {
        // The formatter keeps only the inner exception's text, at a "$" path.
        var state = new ModelStateDictionary();
        state.AddModelError("$", "'b' is an invalid start of a property name. Expected a '\"'. Path: $ | LineNumber: 0 | BytePositionInLine: 1.");
        var context = Executing(state, Http());

        new RestProblemFilterAttribute().OnActionExecuting(context);

        var problem = ProblemOf(context.Result, 400);
        problem.Errors.Should().ContainSingle().Which.Field.Should().Be("body");
        problem.Errors![0].Message.Should().Be("The request body is not valid JSON.");
    }

    [Fact]
    public void ModelState_RunsBeforeTheFrameworksOwn400()
    {
        // ApiController's own model-state filter runs at -2000; ours must come first to answer in the gateway's shape.
        new RestProblemFilterAttribute().Order.Should().BeLessThan(-2000);
    }

    // ---- wrong or missing content type ----

    [Fact]
    public void UnsupportedMediaType_IsAProblemWithItsCode()
    {
        var http = Http();
        var context = new ResultExecutingContext(ActionContextFor(http), [], new UnsupportedMediaTypeResult(), new object());

        new RestProblemFilterAttribute().OnResultExecuting(context);

        var problem = ProblemOf(context.Result, 415);
        problem.Code.Should().Be("UNSUPPORTED_MEDIA_TYPE");
        problem.Detail.Should().Contain("application/json");
    }

    [Fact]
    public void OtherResults_AreLeftAlone()
    {
        var original = new OkObjectResult("x");
        var context = new ResultExecutingContext(ActionContextFor(Http()), [], original, new object());

        new RestProblemFilterAttribute().OnResultExecuting(context);

        context.Result.Should().BeSameAs(original);
    }

    // ---- exceptions ----

    private static ExceptionContext Failed(Exception exception, HttpContext http) =>
        new(ActionContextFor(http), []) { Exception = exception };

    [Fact]
    public void Exception_IsMappedByTheGatewayProblemMapper()
    {
        var context = Failed(new GatewayException("FORBIDDEN", "Not allowed."), Http());

        new RestProblemFilterAttribute().OnException(context);

        var problem = ProblemOf(context.Result, 403);
        problem.Code.Should().Be("FORBIDDEN");
        context.ExceptionHandled.Should().BeTrue();
    }

    [Fact]
    public void UnexpectedException_Is500_WithoutItsText()
    {
        var context = Failed(new InvalidOperationException("connection string Server=secret"), Http());

        new RestProblemFilterAttribute().OnException(context);

        var problem = ProblemOf(context.Result, 500);
        problem.Code.Should().Be("INTERNAL_ERROR");
        JsonSerializer.Serialize(problem).Should().NotContain("secret");
    }

    [Fact]
    public void BodyOverTheLimit_IsA413Problem_NamingTheLimit()
    {
        var context = Failed(new BadHttpRequestException("Request body too large.", StatusCodes.Status413PayloadTooLarge), Http(maxBytes: 2048));

        new RestProblemFilterAttribute().OnException(context);

        var problem = ProblemOf(context.Result, 413);
        problem.Code.Should().Be("PAYLOAD_TOO_LARGE");
        problem.Detail.Should().Contain("2048");
        context.ExceptionHandled.Should().BeTrue();
    }

    [Fact]
    public void BodyThatCouldNotBeRead_IsA400Problem()
    {
        var context = Failed(new BadHttpRequestException("Unexpected end of request content.", StatusCodes.Status400BadRequest), Http());

        new RestProblemFilterAttribute().OnException(context);

        var problem = ProblemOf(context.Result, 400);
        problem.Code.Should().Be("VALIDATION_ERROR");
        problem.Detail.Should().NotContain("Unexpected end");
    }

    [Fact]
    public void AbortedRequest_IsNotAnswered()
    {
        var http = Http();
        using var aborted = new CancellationTokenSource();
        http.RequestAborted = aborted.Token;
        aborted.Cancel();
        var context = Failed(new OperationCanceledException(aborted.Token), http);

        new RestProblemFilterAttribute().OnException(context);

        context.ExceptionHandled.Should().BeFalse();
        context.Result.Should().BeNull();
    }

    // ---- the 415 the router answers before MVC runs ----

    private static async Task<DefaultHttpContext> RunMiddleware(
        string path, int status, bool startResponse = false, string method = "POST", string? allow = null)
    {
        var http = Http();
        http.Request.Method = method;
        http.Request.Path = path;
        http.Response.Body = new MemoryStream();
        var middleware = new RestUnsupportedMediaTypeMiddleware(async context =>
        {
            context.Response.StatusCode = status;
            if (allow is not null)
                context.Response.Headers.Allow = allow;
            if (startResponse)
            {
                // A response that already carries a body (in a real host it has started, which a DefaultHttpContext cannot say).
                context.Response.ContentType = "text/plain";
                await context.Response.WriteAsync("own body");
            }
        });
        await middleware.InvokeAsync(http);
        return http;
    }

    private static string BodyOf(HttpContext http)
    {
        http.Response.Body.Position = 0;
        return new StreamReader(http.Response.Body).ReadToEnd();
    }

    [Fact]
    public async Task Router415_UnderTheRestRoutes_GetsTheProblemBody()
    {
        var http = await RunMiddleware("/api/gateway/Person:insertMany", 415);

        http.Response.StatusCode.Should().Be(415);
        http.Response.ContentType.Should().StartWith("application/problem+json");
        using var body = JsonDocument.Parse(BodyOf(http));
        body.RootElement.GetProperty("code").GetString().Should().Be("UNSUPPORTED_MEDIA_TYPE");
        body.RootElement.GetProperty("status").GetInt32().Should().Be(415);
    }

    [Theory]
    [InlineData("/api/gateway")]
    [InlineData("/api/gateway/")]
    [InlineData("/api/schemas")]
    [InlineData("/api/gateway-options")]
    public async Task Router415_ElsewhereIsLeftAlone(string path)
    {
        var http = await RunMiddleware(path, 415);

        http.Response.StatusCode.Should().Be(415);
        BodyOf(http).Should().BeEmpty();
    }

    [Theory]
    [InlineData(401)]
    [InlineData(500)]
    public async Task Other_StatusesAreLeftAlone(int status)
    {
        var http = await RunMiddleware("/api/gateway/Person", status);

        http.Response.StatusCode.Should().Be(status);
        BodyOf(http).Should().BeEmpty();
    }

    // ---- the 404 and 405 the router answers under the REST routes ----

    [Theory]
    [InlineData("/api/gateway/Person/item/1")]
    [InlineData("/api/gateway/bad-name!")]
    public async Task Router404_UnderTheRestRoutes_IsANotFoundProblem(string path)
    {
        var http = await RunMiddleware(path, 404);

        http.Response.StatusCode.Should().Be(404);
        http.Response.ContentType.Should().StartWith("application/problem+json");
        using var body = JsonDocument.Parse(BodyOf(http));
        body.RootElement.GetProperty("code").GetString().Should().Be("NOT_FOUND");
        body.RootElement.GetProperty("status").GetInt32().Should().Be(404);
        // Points an old /item or /items caller at the routes that exist.
        body.RootElement.GetProperty("detail").GetString().Should().Contain("/api/gateway/{entity}/{id}").And.Contain("{entity}:{method}");
        body.RootElement.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Router405_UnderTheRestRoutes_IsAMethodNotAllowedProblem_NamingTheAllowedMethods()
    {
        var http = await RunMiddleware("/api/gateway/Person", 405, method: "PATCH", allow: "GET, POST");

        http.Response.StatusCode.Should().Be(405);
        http.Response.ContentType.Should().StartWith("application/problem+json");
        http.Response.Headers.Allow.ToString().Should().Be("GET, POST");
        using var body = JsonDocument.Parse(BodyOf(http));
        body.RootElement.GetProperty("code").GetString().Should().Be("METHOD_NOT_ALLOWED");
        body.RootElement.GetProperty("status").GetInt32().Should().Be(405);
        body.RootElement.GetProperty("detail").GetString().Should().Be("The method 'PATCH' is not allowed on this route. Allowed: GET, POST.");
    }

    [Fact]
    public async Task Router405_WithoutAnAllowHeader_StillSaysWhichMethod()
    {
        var http = await RunMiddleware("/api/gateway/Person", 405, method: "DELETE");

        using var body = JsonDocument.Parse(BodyOf(http));
        body.RootElement.GetProperty("detail").GetString().Should().Be("The method 'DELETE' is not allowed on this route.");
    }

    [Theory]
    [InlineData("/api/gateway", 404)]
    [InlineData("/api/gateway/", 404)]
    [InlineData("/api/gateway", 405)]
    [InlineData("/api/schemas", 404)]
    [InlineData("/api/gateway-options", 405)]
    public async Task Router404Or405_ElsewhereIsLeftAlone(string path, int status)
    {
        var http = await RunMiddleware(path, status);

        http.Response.StatusCode.Should().Be(status);
        BodyOf(http).Should().BeEmpty();
    }

    [Fact]
    public async Task A404WithItsOwnBody_IsLeftAlone()
    {
        // The service's own NOT_FOUND (an unknown entity or record) already carries a problem body.
        var http = await RunMiddleware("/api/gateway/Person/p1", 404, startResponse: true);

        BodyOf(http).Should().Be("own body");
    }

    [Fact]
    public async Task A415WithItsOwnBody_IsLeftAlone()
    {
        var http = await RunMiddleware("/api/gateway/Person", 415, startResponse: true);

        BodyOf(http).Should().Be("own body");
    }
}
