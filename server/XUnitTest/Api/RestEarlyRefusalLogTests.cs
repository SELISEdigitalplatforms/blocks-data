using System.Diagnostics;
using System.Text.Json;
using Api.Controllers;
using Blocks.Data.Api.Middleware;
using DataGateway.DomainService.Helpers;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Logging;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;
using XUnitTest.DataGateway;

namespace XUnitTest.Api;

/// <summary>
/// The REST requests that are refused before the service runs still leave a request-log entry (spec 2026-11-04 §4):
/// an unknown custom-method verb (the action ran, so the request was otherwise well-formed) and a wrong content type
/// (the router, or the <c>[Consumes]</c> filter, refuses it). Entries carry transport <c>rest</c>, and an entity name
/// only when it passes the schema-name rule. A 404, a 405 and anything outside the REST routes are not logged.
/// </summary>
public class RestEarlyRefusalLogTests
{
    private static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static DefaultHttpContext Http(string method, string path, string? query = null)
    {
        var services = new ServiceCollection();
        services.AddSingleton(Options.Create(new RestLimits()));
        var http = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        http.Request.Method = method;
        http.Request.Path = path;
        if (query is not null)
            http.Request.QueryString = new QueryString(query);
        http.Response.Body = new MemoryStream();
        return http;
    }

    private static Activity StartRequest() => new Activity("rest-request").Start();

    private static Dictionary<string, object?>? Entry(Activity activity)
    {
        var tags = activity.TagObjects.Where(t => t.Key == "GatewayOperation").ToList();
        tags.Should().HaveCountLessThanOrEqualTo(1, "a request is logged once");
        return tags.Count == 0 ? null : tags[0].Value.Should().BeOfType<Dictionary<string, object?>>().Subject;
    }

    private static async Task RunMiddleware(DefaultHttpContext http, int status)
    {
        var middleware = new RestUnsupportedMediaTypeMiddleware(context =>
        {
            context.Response.StatusCode = status;
            return Task.CompletedTask;
        });
        await middleware.InvokeAsync(http);
    }

    // ---- the 415 the router answers ----

    [Theory]
    [InlineData("POST", "/api/gateway/E", "insertE", "mutation")]
    [InlineData("PATCH", "/api/gateway/E/i1", "updateE", "mutation")]
    [InlineData("PUT", "/api/gateway/E/i1", "upsertE", "mutation")]
    [InlineData("POST", "/api/gateway/E:query", "getEs", "query")]
    [InlineData("POST", "/api/gateway/E:insertMany", "insertManyE", "mutation")]
    [InlineData("POST", "/api/gateway/E:updateMany", "updateManyE", "mutation")]
    [InlineData("POST", "/api/gateway/E:deleteMany", "deleteManyE", "mutation")]
    [InlineData("POST", "/api/gateway/E:nope", "unknownE", "mutation")]
    [InlineData("POST", "/api/gateway/E:DeleteMany", "unknownE", "mutation")]
    public async Task Wrong415_IsLoggedUnderTheOperationTheRouteWouldHaveRun(string method, string path, string name, string type)
    {
        using var activity = StartRequest();
        var http = Http(method, path, "?trace=1");

        await RunMiddleware(http, 415);

        var entry = Entry(activity).Should().NotBeNull().And.Subject as Dictionary<string, object?>;
        entry!["Transport"].Should().Be("rest");
        entry["SchemaName"].Should().Be(name);
        entry["EntityName"].Should().Be("E");
        entry["OperationType"].Should().Be(type);
        entry["ResponseStatus"].Should().Be("failed");
        entry["FailureKind"].Should().Be(GatewayFailureKind.BadRequest);
        entry["FailureCode"].Should().Be("UNSUPPORTED_MEDIA_TYPE");
        entry["FailureMessage"].Should().BeOfType<string>().Which.Should().Contain("application/json");
        entry["OperationQuery"].Should().Be($"{method} {path}?trace=1", "the body was never read, so none is logged");
    }

    [Theory]
    [InlineData("/api/gateway/bad-name!")]
    [InlineData("/api/gateway/bad-name!:query")]
    [InlineData("/api/gateway/1Starts/i1")]
    public async Task Wrong415_WithAnEntityThatBreaksTheNameRule_RecordsNoEntityName(string path)
    {
        using var activity = StartRequest();

        await RunMiddleware(Http("POST", path), 415);

        var entry = Entry(activity)!;
        entry["EntityName"].Should().BeNull();
        entry["SchemaName"].Should().Be("unknown");
        entry["FailureCode"].Should().Be("UNSUPPORTED_MEDIA_TYPE");
    }

    [Theory]
    [InlineData("/api/gateway", 415)]
    [InlineData("/api/gateway/", 415)]
    [InlineData("/api/schemas", 415)]
    [InlineData("/api/gateway/E/item/1", 404)]
    [InlineData("/api/gateway/E", 405)]
    [InlineData("/api/gateway/E", 401)]
    [InlineData("/api/gateway/E", 500)]
    public async Task OtherAnswers_AndOtherPaths_AreNotLogged(string path, int status)
    {
        using var activity = StartRequest();

        await RunMiddleware(Http("POST", path), status);

        Entry(activity).Should().BeNull();
    }

    [Fact]
    public async Task Wrong415_ThatAlreadyHasABody_IsNotLoggedAgain()
    {
        using var activity = StartRequest();
        var http = Http("POST", "/api/gateway/E");
        var middleware = new RestUnsupportedMediaTypeMiddleware(async context =>
        {
            context.Response.StatusCode = 415;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync("{}");
        });

        await middleware.InvokeAsync(http);

        Entry(activity).Should().BeNull();
    }

    [Fact]
    public async Task Wrong415_WithoutAnActivity_IsStillAnswered()
    {
        Activity.Current.Should().BeNull();
        var http = Http("POST", "/api/gateway/E");

        await RunMiddleware(http, 415);

        http.Response.ContentType.Should().StartWith("application/problem+json");
    }

    // ---- the 415 of a missing content type, refused in the action pipeline ----

    [Fact]
    public void MissingContentType415_FromConsumes_IsLoggedToo()
    {
        using var activity = StartRequest();
        var http = Http("POST", "/api/gateway/E:updateMany");
        var context = new ResultExecutingContext(
            new ActionContext(http, new RouteData(), new ActionDescriptor(), new ModelStateDictionary()),
            [], new StatusCodeResult(StatusCodes.Status415UnsupportedMediaType), controller: new object());

        new RestProblemFilterAttribute().OnResultExecuting(context);

        var entry = Entry(activity)!;
        entry["Transport"].Should().Be("rest");
        entry["SchemaName"].Should().Be("updateManyE");
        entry["EntityName"].Should().Be("E");
        entry["FailureCode"].Should().Be("UNSUPPORTED_MEDIA_TYPE");
    }

    // ---- the unknown verb ----

    private readonly Mock<IGatewayRestService> _service = new(MockBehavior.Strict);

    private DataGatewayController Controller(DefaultHttpContext http) =>
        new(_service.Object) { ControllerContext = new ControllerContext { HttpContext = http } };

    [Theory]
    [InlineData("DeleteMany")]
    [InlineData("nope")]
    [InlineData("")]
    public async Task UnknownVerb_WritesOneEntry(string verb)
    {
        using var activity = StartRequest();
        var http = Http("POST", $"/api/gateway/Person:{verb}", "?a=1");

        await Controller(http).CustomMethod("Person", verb, Json("{}"));

        var entry = Entry(activity)!;
        entry["Transport"].Should().Be("rest");
        entry["SchemaName"].Should().Be("unknownPerson");
        entry["EntityName"].Should().Be("Person");
        entry["OperationType"].Should().Be("mutation");
        entry["ResponseStatus"].Should().Be("failed");
        entry["FailureKind"].Should().Be(GatewayFailureKind.BadRequest);
        entry["FailureCode"].Should().Be("UNKNOWN_METHOD");
        entry["FailureMessage"].Should().Be($"Unknown method '{verb}'. Use one of: query, insertMany, updateMany, deleteMany.");
        entry["OperationQuery"].Should().Be($"POST /api/gateway/Person:{verb}?a=1");
        _service.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task UnknownVerb_ThatIsLong_IsEchoedTruncatedTo64Characters()
    {
        using var activity = StartRequest();
        var verb = new string('v', 500);
        var http = Http("POST", $"/api/gateway/Person:{verb}");

        var result = await Controller(http).CustomMethod("Person", verb, Json("{}"));

        var expected = $"Unknown method '{new string('v', 64)}…'. Use one of: query, insertMany, updateMany, deleteMany.";
        result.Should().BeOfType<ObjectResult>().Which.Value
            .Should().BeOfType<GatewayProblem>().Which.Detail.Should().Be(expected);
        Entry(activity)!["FailureMessage"].Should().Be(expected);
    }

    [Fact]
    public async Task UnknownVerb_WithAnEmojiAcrossTheCut_IsEchoedWithoutHalfOfIt()
    {
        // The emoji is two UTF-16 chars at index 63 and 64; cutting at 64 would leave a lone high surrogate.
        using var activity = StartRequest();
        var verb = new string('v', 63) + "\U0001F600" + "vvvv";

        var result = await Controller(Http("POST", "/api/gateway/Person:x")).CustomMethod("Person", verb, Json("{}"));

        var expected = $"Unknown method '{new string('v', 63)}…'. Use one of: query, insertMany, updateMany, deleteMany.";
        result.Should().BeOfType<ObjectResult>().Which.Value
            .Should().BeOfType<GatewayProblem>().Which.Detail.Should().Be(expected);
        Entry(activity)!["FailureMessage"].Should().Be(expected);
    }

    [Theory]
    [InlineData(63)]
    [InlineData(64)]
    public async Task UnknownVerb_Of64CharactersOrFewer_IsEchoedWhole(int length)
    {
        using var activity = StartRequest();
        var verb = new string('v', length);

        await Controller(Http("POST", $"/api/gateway/Person:{verb}")).CustomMethod("Person", verb, Json("{}"));

        Entry(activity)!["FailureMessage"].Should()
            .Be($"Unknown method '{verb}'. Use one of: query, insertMany, updateMany, deleteMany.");
    }

    [Fact]
    public async Task UnknownVerb_WithABadHardDelete_IsStillLogged_AsTheUnknownMethodItIs()
    {
        // hardDelete is read only by deleteMany, so it cannot make another verb's request malformed.
        using var activity = StartRequest();
        var http = Http("POST", "/api/gateway/Person:nope", "?hardDelete=zz");

        await Controller(http).CustomMethod("Person", "nope", Json("{}"));

        Entry(activity)!["FailureCode"].Should().Be("UNKNOWN_METHOD");
    }

    [Fact]
    public async Task DeleteMany_WithABadHardDelete_IsRefusedAsValidation_AndNotLoggedByTheAction()
    {
        // The request did not bind (spec ruling R-V2-8): the existing validation path answers, no unknown-verb entry.
        using var activity = StartRequest();
        var http = Http("POST", "/api/gateway/Person:deleteMany", "?hardDelete=zz");

        var result = await Controller(http).CustomMethod("Person", "deleteMany", Json("{}"));

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(400);
        Entry(activity).Should().BeNull();
        _service.Invocations.Should().BeEmpty();
    }

    [Theory]
    [InlineData("query")]
    [InlineData("insertMany")]
    [InlineData("updateMany")]
    public async Task KnownVerb_IsLoggedOnlyByTheService(string verb)
    {
        using var activity = StartRequest();
        var http = Http("POST", $"/api/gateway/Person:{verb}");
        _service.Setup(s => s.GetAsync(http, "Person", It.IsAny<JsonElement?>())).ReturnsAsync(new RestResult(200, new { }));
        _service.Setup(s => s.InsertManyAsync(http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(new RestResult(200, new { }));
        _service.Setup(s => s.UpdateManyAsync(http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(new RestResult(200, new { }));

        await Controller(http).CustomMethod("Person", verb, Json("{}"));

        Entry(activity).Should().BeNull("the mocked service logs nothing, and the action must not add an entry of its own");
    }

    // ---- the log call itself ----

    [Fact]
    public void Refused_WithAnEntityThatBreaksTheRule_RecordsNoEntityName()
    {
        using var activity = StartRequest();

        RestOperationLog.Refused(Http("POST", "/api/gateway/x"), "bad-name!", "unknown", 400, "UNKNOWN_METHOD", "no");

        Entry(activity)!["EntityName"].Should().BeNull();
    }

    [Theory]
    [InlineData(401, GatewayFailureKind.Authentication)]
    [InlineData(403, GatewayFailureKind.Authorization)]
    [InlineData(404, GatewayFailureKind.BadRequest)]
    [InlineData(415, GatewayFailureKind.BadRequest)]
    [InlineData(500, GatewayFailureKind.Unhandled)]
    public void Refused_KindFollowsTheStatus(int status, string kind)
    {
        using var activity = StartRequest();

        RestOperationLog.Refused(Http("GET", "/api/gateway/E"), "E", "getEs", status, "CODE", "why");

        var entry = Entry(activity)!;
        entry["FailureKind"].Should().Be(kind);
        entry["OperationType"].Should().Be("query");
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public void Refused_InAppRequest_IsFalseOnlyForAnImpersonatedConsoleCaller(bool impersonated, bool inApp)
    {
        using var activity = StartRequest();
        TestSupport.SetContext(impersonated: impersonated);
        try
        {
            RestOperationLog.Refused(Http("POST", "/api/gateway/E:nope"), "E", "unknownE", 400, "UNKNOWN_METHOD", "why");
        }
        finally
        {
            TestSupport.ClearContext();
        }

        Entry(activity)!["InAppRequest"].Should().Be(inApp);
    }

    [Fact]
    public void Refused_WithoutAContext_CountsAsInApp()
    {
        // Refusals can run before the caller is known; without a context nobody is impersonating (R-V2-14).
        using var activity = StartRequest();
        TestSupport.ClearContext();

        RestOperationLog.Refused(Http("POST", "/api/gateway/E:nope"), "E", "unknownE", 400, "UNKNOWN_METHOD", "why");

        Entry(activity)!["InAppRequest"].Should().Be(true);
    }

    [Fact]
    public void Refused_WithoutAnActivity_DoesNothing()
    {
        Activity.Current.Should().BeNull();

        var act = () => RestOperationLog.Refused(Http("GET", "/api/gateway/E"), "E", "getEs", 400, "CODE", "why");

        act.Should().NotThrow();
    }
}
