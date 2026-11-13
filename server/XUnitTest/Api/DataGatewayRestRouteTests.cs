using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Api.Controllers;
using Blocks.Data.Api.Middleware;
using Blocks.Genesis;
using DataGateway.Rest;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.Mvc.Formatters;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace XUnitTest.Api;

/// <summary>
/// The REST routes of the Data Gateway, read from the controller's attributes: the table is the public contract
/// (spec 2026-11-04 §2), so a renamed template or a changed verb must fail here.
/// </summary>
public class DataGatewayRestRouteTests
{
    private const string Collection = "{entity:schemaName}";
    private const string Record = "{entity:schemaName}/{itemId}";
    private const string Custom = "{entity:schemaName}:{verb}";

    private static readonly (string Action, string Verb, string Template)[] Expected =
    [
        ("Get", "GET", Collection),
        ("Insert", "POST", Collection),
        ("GetById", "GET", Record),
        ("Update", "PATCH", Record),
        ("Upsert", "PUT", Record),
        ("Delete", "DELETE", Record),
        ("CustomMethod", "POST", Custom),
    ];

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(DataGatewayController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);

    private static (string Action, string Verb, string Template) Route(MethodInfo action)
    {
        var http = action.GetCustomAttributes<HttpMethodAttribute>().Should().ContainSingle().Subject;
        return (action.Name, http.HttpMethods.Should().ContainSingle().Subject, http.Template ?? "");
    }

    [Fact]
    public void EveryAction_HasExpectedVerbAndTemplate()
    {
        Actions().Select(Route).Should().BeEquivalentTo(Expected);

        // The entity sits in each action's template, not the controller's, so that the custom-method segment
        // ({entity}:{verb}) can share it: an action template can only add segments after the controller's.
        typeof(DataGatewayController).GetCustomAttribute<RouteAttribute>()!.Template.Should().Be("gateway");
        typeof(DataGatewayController).GetCustomAttribute<ApiControllerAttribute>().Should().NotBeNull();
    }

    [Fact]
    public void Routes_DoNotCollide()
    {
        var routes = Actions().Select(Route).Select(r => (r.Verb, r.Template)).ToList();

        routes.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void EveryAction_BindsTheEntityFromTheRoute_AndItemIdsToo()
    {
        foreach (var action in Actions())
        {
            var parameters = action.GetParameters();
            parameters.Select(p => p.Name).Should().Contain("entity");
            var template = Route(action).Template;
            if (template.Contains("{itemId}"))
                parameters.Select(p => p.Name).Should().Contain("itemId");
            else
                parameters.Select(p => p.Name).Should().NotContain("itemId");
        }
    }

    [Fact]
    public void EveryActionThatReadsABody_ConsumesJson_AndTakesItFromTheBody()
    {
        var withBody = new[]
        {
            (Verb: "POST", Template: Collection), (Verb: "PATCH", Template: Record), (Verb: "PUT", Template: Record),
            (Verb: "POST", Template: Custom),
        };

        foreach (var action in Actions())
        {
            var route = Route(action);
            var reads = withBody.Contains((route.Verb, route.Template));
            var consumes = action.GetCustomAttribute<ConsumesAttribute>();
            if (reads)
            {
                consumes.Should().NotBeNull($"{route.Verb} {route.Template} reads a JSON body");
                consumes!.ContentTypes.Should().Equal("application/json");
                action.GetParameters().Should().ContainSingle(p => p.GetCustomAttribute<FromBodyAttribute>() != null);
            }
            else
            {
                consumes.Should().BeNull();
                action.GetParameters().Should().NotContain(p => p.GetCustomAttribute<FromBodyAttribute>() != null);
            }
        }
    }

    [Fact]
    public void Delete_TakesHardDeleteFromTheQuery_DefaultingToFalse()
    {
        var parameter = typeof(DataGatewayController).GetMethod("Delete")!.GetParameters().Single(p => p.Name == "hardDelete");

        parameter.ParameterType.Should().Be(typeof(bool));
        parameter.GetCustomAttribute<FromQueryAttribute>().Should().NotBeNull();
        parameter.HasDefaultValue.Should().BeTrue();
        parameter.DefaultValue.Should().Be(false);
    }

    [Fact]
    public void CustomMethod_DoesNotBindHardDelete_OnlyDeleteManyReadsIt()
    {
        // Bound as a parameter it would refuse `POST /{entity}:query?hardDelete=zz` before the verb is known.
        typeof(DataGatewayController).GetMethod("CustomMethod")!.GetParameters().Select(p => p.Name)
            .Should().Equal("entity", "verb", "body");
    }

    [Fact]
    public void CustomMethod_DocumentsItsTypedResponses()
    {
        var produces = typeof(DataGatewayController).GetMethod("CustomMethod")!.GetCustomAttributes<ProducesResponseTypeAttribute>()
            .Where(a => a.StatusCode == 200).Select(a => a.Type).ToList();

        // query answers a list; insertMany, updateMany and deleteMany answer the bulk response.
        produces.Should().BeEquivalentTo([typeof(RestListResponse), typeof(RestBulkResponse)]);
    }

    [Fact]
    public void Controller_DocumentsMethodNotAllowed_AsAProblem()
    {
        var produces = typeof(DataGatewayController).GetCustomAttributes<ProducesResponseTypeAttribute>()
            .Single(a => a.StatusCode == 405);

        produces.Type.Should().Be(typeof(global::DataGateway.Rest.Errors.GatewayProblem));
        var contentTypes = new MediaTypeCollection();
        ((IApiResponseMetadataProvider)produces).SetContentTypes(contentTypes);
        contentTypes.Should().Equal("application/problem+json");
    }

    [Fact]
    public void CustomMethods_AreExactlyTheFourVerbs()
    {
        RestCustomMethods.All.Should().Equal("query", "insertMany", "updateMany", "deleteMany");
    }

    [Fact]
    public void Controller_CarriesProblemAndSizeLimitFilters()
    {
        // Without these the 400/413/415 problem contract and the request body limit silently disappear.
        typeof(DataGatewayController).GetCustomAttribute<RestProblemFilterAttribute>().Should().NotBeNull();
        typeof(DataGatewayController).GetCustomAttribute<RestRequestSizeLimitAttribute>().Should().NotBeNull();
    }

    [Fact]
    public void Controller_IsNotProtectedByAnEndpointPolicy_SoPublicEntitiesWorkAnonymously()
    {
        typeof(DataGatewayController).GetCustomAttribute<ProtectedEndPointAttribute>().Should().BeNull();
        Actions().Should().OnlyContain(a => a.GetCustomAttribute<ProtectedEndPointAttribute>() == null);
    }

    // ---- the schemaName route constraint ----

    [Theory]
    [InlineData("E", true)]
    [InlineData("_Person_2", true)]
    [InlineData("Employee:unknownVerb", false)]
    [InlineData("bad-name!", false)]
    [InlineData("1Starts", false)]
    [InlineData("Nämé", false)]
    [InlineData("", false)]
    [InlineData("A\n", false)]
    public void SchemaNameConstraint_FollowsTheSchemaNameRule(string value, bool matches)
    {
        Matches(value).Should().Be(matches);
    }

    [Fact]
    public void SchemaNameConstraint_AllowsOneToFiftyCharacters()
    {
        Matches(new string('A', 50)).Should().BeTrue();
        Matches(new string('A', 51)).Should().BeFalse();
    }

    [Fact]
    public void SchemaNameConstraint_WithoutAValue_DoesNotMatch()
    {
        new SchemaNameRouteConstraint().Match(null, null, "entity", new RouteValueDictionary(), RouteDirection.IncomingRequest)
            .Should().BeFalse();
    }

    private static bool Matches(string value) =>
        new SchemaNameRouteConstraint().Match(
            null, null, "entity", new RouteValueDictionary { ["entity"] = value }, RouteDirection.IncomingRequest);
}

/// <summary>
/// The REST routes as the router resolves them, end to end over HTTP: the real controller, constraint, API prefix,
/// SPA fallback and problem middleware, in <c>Program.cs</c>'s order, with a stand-in for the service below the
/// controller and for the GraphQL endpoint at <c>/api/gateway</c>. Run alone (the serial collection): starting the
/// host is CPU-heavy, and wall-clock timing tests elsewhere fail when it runs beside them.
/// </summary>
[Collection("ContextSerial")]
public sealed class DataGatewayRestRoutingTests(DataGatewayRestRoutingTests.Host host)
    : IClassFixture<DataGatewayRestRoutingTests.Host>
{
    private const string UnknownMethodDetail = "Unknown method '{0}'. Use one of: query, insertMany, updateMany, deleteMany.";

    // ---- the 10 routes of spec §2 ----

    [Theory]
    [InlineData("GET", "/api/gateway/E?pageNo=1&pageSize=5", null, "list E")]
    [InlineData("GET", "/api/gateway/E/i1?select=Name", null, "getById E i1")]
    [InlineData("POST", "/api/gateway/E", """{"Name":"a"}""", "insert E")]
    [InlineData("PATCH", "/api/gateway/E/i1", """{"Name":"b"}""", "update E i1")]
    [InlineData("PUT", "/api/gateway/E/i1", """{"Name":"c"}""", "upsert E i1")]
    [InlineData("DELETE", "/api/gateway/E/i1?hardDelete=true", null, "delete E i1 hard=True")]
    [InlineData("POST", "/api/gateway/E:query", """{"where":{}}""", "query E")]
    [InlineData("POST", "/api/gateway/E:insertMany", """[{"Name":"a"}]""", "insertMany E")]
    [InlineData("POST", "/api/gateway/E:updateMany", """{"where":{},"input":{}}""", "updateMany E")]
    [InlineData("POST", "/api/gateway/E:deleteMany?hardDelete=true", """{"where":{}}""", "deleteMany E hard=True")]
    public async Task EachRoute_ReachesItsAction(string method, string path, string? body, string call)
    {
        var response = await host.SendAsync(method, path, body);

        await ShouldReach(response, call);
    }

    [Fact]
    public async Task Delete_WithoutHardDelete_IsSoft()
    {
        await ShouldReach(await host.SendAsync("DELETE", "/api/gateway/E/i1"), "delete E i1 hard=False");
        await ShouldReach(await host.SendAsync("POST", "/api/gateway/E:deleteMany", """{"where":{}}"""), "deleteMany E hard=False");
    }

    [Fact]
    public async Task EncodedColon_ReachesTheCustomMethod()
    {
        await ShouldReach(await host.SendAsync("POST", "/api/gateway/E%3AdeleteMany", """{"where":{}}"""), "deleteMany E hard=False");
        await ShouldReach(await host.SendAsync("POST", "/api/gateway/E%3aquery", "{}"), "query E");
    }

    [Theory]
    [InlineData("query")]
    [InlineData("items")]
    [InlineData("item")]
    public async Task VerbLikeIds_AreRecordIds(string itemId)
    {
        // Review Focus 1: no path word is reserved, so an id that reads like a verb or an old segment is just an id.
        await ShouldReach(await host.SendAsync("GET", $"/api/gateway/E/{itemId}"), $"getById E {itemId}");
    }

    [Fact]
    public async Task SchemaNameOfFiftyCharacters_IsAnEntity()
    {
        var name = new string('A', 50);

        await ShouldReach(await host.SendAsync("GET", $"/api/gateway/{name}"), $"list {name}");
    }

    // ---- custom methods: exact verbs only ----

    [Theory]
    [InlineData("DeleteMany")]
    [InlineData("QUERY")]
    [InlineData("nope")]
    [InlineData("unknownVerb")]
    public async Task UnknownOrWronglyCasedVerb_Is400UnknownMethod_AndRunsNothing(string verb)
    {
        var response = await host.SendAsync("POST", $"/api/gateway/E:{verb}", """{"where":{}}""");

        var problem = await ShouldBeProblem(response, HttpStatusCode.BadRequest, "UNKNOWN_METHOD");
        problem.GetProperty("detail").GetString().Should().Be(string.Format(UnknownMethodDetail, verb));
        host.Service.Calls.Should().BeEmpty("an unknown verb never falls through to insert or any other operation");
    }

    [Theory]
    [InlineData("zz")]
    [InlineData("")]
    [InlineData("1")]
    [InlineData("%20")]
    public async Task HardDelete_ThatIsNotABool_IsRefusedByDeleteMany_AsItIsByDeleteOne(string value)
    {
        var one = await ShouldBeProblem(
            await host.SendAsync("DELETE", $"/api/gateway/E/i1?hardDelete={value}"), HttpStatusCode.BadRequest, "VALIDATION_ERROR");
        var many = await ShouldBeProblem(
            await host.SendAsync("POST", $"/api/gateway/E:deleteMany?hardDelete={value}", """{"where":{}}"""), HttpStatusCode.BadRequest, "VALIDATION_ERROR");

        // Same field, message and rule: the arm reads the query as the bound bool did.
        many.GetProperty("errors").GetRawText().Should().Be(one.GetProperty("errors").GetRawText());
        many.GetProperty("detail").GetString().Should().Be(one.GetProperty("detail").GetString());
        host.Service.Calls.Should().BeEmpty();
    }

    [Theory]
    [InlineData("TRUE", "True")]
    [InlineData("false", "False")]
    [InlineData("%20true", "True")]
    [InlineData("true&hardDelete=false", "True")]
    [InlineData("false&hardDelete=true", "False")]
    public async Task HardDelete_OnDeleteMany_IsReadAsTheBoundBoolWas(string value, string hard)
    {
        await ShouldReach(
            await host.SendAsync("POST", $"/api/gateway/E:deleteMany?hardDelete={value}", """{"where":{}}"""), $"deleteMany E hard={hard}");
        await ShouldReach(await host.SendAsync("DELETE", $"/api/gateway/E/i1?hardDelete={value}"), $"delete E i1 hard={hard}");
    }

    [Theory]
    [InlineData("query", """{"where":{}}""", "query E")]
    [InlineData("insertMany", """[{"Name":"a"}]""", "insertMany E")]
    [InlineData("updateMany", """{"where":{},"input":{}}""", "updateMany E")]
    public async Task HardDelete_ThatIsNotABool_DoesNotRefuseTheOtherVerbs(string verb, string body, string call)
    {
        await ShouldReach(await host.SendAsync("POST", $"/api/gateway/E:{verb}?hardDelete=zz", body), call);
    }

    [Fact]
    public async Task HardDelete_ThatIsNotABool_DoesNotHideAnUnknownVerb()
    {
        var response = await host.SendAsync("POST", "/api/gateway/E:nope?hardDelete=zz", "{}");

        await ShouldBeProblem(response, HttpStatusCode.BadRequest, "UNKNOWN_METHOD");
    }

    [Fact]
    public async Task CustomMethod_WithTheWrongContentType_Is415Problem()
    {
        var response = await host.SendAsync("POST", "/api/gateway/E:query", "{}", contentType: "text/plain");

        await ShouldBeProblem(response, HttpStatusCode.UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE");
        host.Service.Calls.Should().BeEmpty();
    }

    // ---- the request log of what is refused early ----

    [Theory]
    [InlineData("POST", "/api/gateway/E", "insertE", "UNSUPPORTED_MEDIA_TYPE")]
    [InlineData("POST", "/api/gateway/E:query", "getEs", "UNSUPPORTED_MEDIA_TYPE")]
    [InlineData("POST", "/api/gateway/E:nope", "unknownE", "UNSUPPORTED_MEDIA_TYPE")]
    public async Task WrongContentType_WritesOneLogEntry_ThroughTheRealPipeline(string method, string path, string name, string code)
    {
        var entry = await host.LoggedAsync(() => host.SendAsync(method, path, "{}", contentType: "text/plain"), path);

        entry["Transport"].Should().Be("rest");
        entry["SchemaName"].Should().Be(name);
        entry["EntityName"].Should().Be("E");
        entry["FailureCode"].Should().Be(code);
    }

    [Fact]
    public async Task UnknownVerb_WritesOneLogEntry_ThroughTheRealPipeline()
    {
        const string path = "/api/gateway/E:nope";

        var entry = await host.LoggedAsync(() => host.SendAsync("POST", path, "{}"), path);

        entry["Transport"].Should().Be("rest");
        entry["SchemaName"].Should().Be("unknownE");
        entry["OperationType"].Should().Be("mutation");
        entry["FailureKind"].Should().Be("bad_request");
        entry["FailureCode"].Should().Be("UNKNOWN_METHOD");
    }

    // ---- what does not exist ----

    [Theory]
    [InlineData("PATCH", "/api/gateway/E", "{}")]
    [InlineData("DELETE", "/api/gateway/E", null)]
    [InlineData("DELETE", "/api/gateway/E:deleteMany", null)]
    [InlineData("PATCH", "/api/gateway/E:updateMany", "{}")]
    public async Task NoBulkWriteOnTheCollection_Is405Problem(string method, string path, string? body)
    {
        var response = await host.SendAsync(method, path, body);

        var problem = await ShouldBeProblem(response, HttpStatusCode.MethodNotAllowed, "METHOD_NOT_ALLOWED");
        problem.GetProperty("detail").GetString().Should().Contain(method);
        response.Content.Headers.Allow.Should().NotBeEmpty("the router names the methods the path takes");
        host.Service.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task OldItemRoute_Is404Problem()
    {
        // Review Focus 2: an old /item/{id} URL is a readable error, not a 500, an empty body or the SPA's page.
        var response = await host.SendAsync("GET", "/api/gateway/E/item/1");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "NOT_FOUND");
        host.Service.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task UnmatchedRestPath_IsAProblem_WhateverItsCase()
    {
        var response = await host.SendAsync("GET", "/API/Gateway/E/item/1");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "NOT_FOUND");
    }

    [Fact]
    public async Task Head_OnAnUnmatchedRestPath_Is404()
    {
        // A HEAD answer carries no body; giving it the problem body must not break the response.
        var response = await host.SendAsync("HEAD", "/api/gateway/E/item/1");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await host.SendAsync("GET", "/api/gateway/E")).StatusCode.Should().Be(HttpStatusCode.OK, "the connection is still usable");
    }

    [Fact]
    public async Task OldItemsRoute_Is405Problem()
    {
        var response = await host.SendAsync("POST", "/api/gateway/E/items", "[]");

        await ShouldBeProblem(response, HttpStatusCode.MethodNotAllowed, "METHOD_NOT_ALLOWED");
        host.Service.Calls.Should().BeEmpty();
    }

    [Theory]
    [InlineData("/api/gateway/bad-name!", false)]
    [InlineData("/api/gateway/bad-name!", true)]
    [InlineData("/api/gateway/1Starts/i1", false)]
    [InlineData("/api/gateway/1Starts/i1", true)]
    public async Task NameThatBreaksTheSchemaNameRule_Is404Problem_ForEveryCaller(string path, bool authenticated)
    {
        // Spec §3.3 (amended): routing refuses it before the service, so anonymous callers get 404 too.
        var response = await host.SendAsync("GET", path, bearer: authenticated ? "token" : null);

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "NOT_FOUND");
        host.Service.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task NameOfFiftyOneCharacters_Is404Problem()
    {
        var response = await host.SendAsync("GET", $"/api/gateway/{new string('A', 51)}");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "NOT_FOUND");
    }

    [Fact]
    public async Task CustomVerbOnGet_IsAProblem_NotTheSpa()
    {
        var response = await host.SendAsync("GET", "/api/gateway/E:query");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "NOT_FOUND");
    }

    // ---- what stays as it is ----

    [Fact]
    public async Task GraphQL_StillAnswersAtTheGatewayRoot()
    {
        // Review Focus 4.
        var response = await host.SendAsync("POST", "/api/gateway", """{"query":"{ __typename }"}""");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be(Host.GraphQLAnswer);
        host.Service.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task SpaRoutes_StillServeTheSpa()
    {
        // Proves the SPA fallback is mapped here, so the 404s above are not just its absence.
        var response = await host.SendAsync("GET", "/data-gateway/schemas");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be(Host.SpaPage);
    }

    [Fact]
    public async Task PathsThatOnlyStartLikeTheGateway_StillServeTheSpa()
    {
        var response = await host.SendAsync("GET", "/api/gatewayx/1");

        (await response.Content.ReadAsStringAsync()).Should().Be(Host.SpaPage);
    }

    // ---- helpers ----

    private async Task ShouldReach(HttpResponseMessage response, string call)
    {
        var text = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(HttpStatusCode.OK, text);
        using var body = JsonDocument.Parse(text);
        body.RootElement.GetProperty("call").GetString().Should().Be(call);
        host.Service.Calls.Should().Equal(call);
    }

    private static async Task<JsonElement> ShouldBeProblem(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        var text = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(status, text);
        (response.Content.Headers.ContentType?.MediaType).Should().Be("application/problem+json", text);
        using var body = JsonDocument.Parse(text);
        body.RootElement.GetProperty("code").GetString().Should().Be(code);
        body.RootElement.GetProperty("status").GetInt32().Should().Be((int)status);
        return body.RootElement.Clone();
    }

    /// <summary>A Kestrel host on a loopback port, wired as <c>Program.cs</c> wires the REST routes.</summary>
    public sealed class Host : IAsyncLifetime
    {
        public const string GraphQLAnswer = "graphql";
        public const string SpaPage = "<html>spa</html>";

        private WebApplication? _app;
        private HttpClient? _client;
        private string? _webRoot;

        public RecordingRestService Service { get; } = new();

        private readonly ConcurrentQueue<Dictionary<string, object?>> _logged = new();
        private ActivityListener? _listener;

        /// <summary>
        /// Sends a request and returns the one request-log entry whose <c>OperationQuery</c> starts with
        /// <c>"METHOD path"</c> for it, read from the finished request activity (as the trace exporter would).
        /// </summary>
        public async Task<Dictionary<string, object?>> LoggedAsync(Func<Task<HttpResponseMessage>> send, string path)
        {
            _logged.Clear();
            (await send()).Dispose();
            // The activity stops after the response is written; give the server a moment to finish.
            for (var i = 0; i < 50 && !_logged.Any(e => Query(e).Contains(path, StringComparison.Ordinal)); i++)
                await Task.Delay(20);
            return _logged.Where(e => Query(e).Contains(path, StringComparison.Ordinal)).Should().ContainSingle().Subject;
        }

        private static string Query(Dictionary<string, object?> entry) => entry["OperationQuery"] as string ?? string.Empty;

        public async Task InitializeAsync()
        {
            _webRoot = Directory.CreateTempSubdirectory("rest-routes-").FullName;
            await File.WriteAllTextAsync(Path.Combine(_webRoot, "index.html"), SpaPage);

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                ContentRootPath = _webRoot,
                WebRootPath = _webRoot,
                EnvironmentName = Environments.Production,
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            builder.Services.AddSingleton<IGatewayRestService>(Service);
            builder.Services.AddControllers().AddApplicationPart(typeof(DataGatewayController).Assembly);
            builder.Services.Configure<MvcOptions>(options => options.Conventions.Insert(0, ApiPrefixConvention()));
            builder.Services.Configure<RouteOptions>(options =>
                options.ConstraintMap[SchemaNameRouteConstraint.Name] = typeof(SchemaNameRouteConstraint));

            _app = builder.Build();
            // Same order as Program.cs: the SPA shell is rendered with the response's style nonce.
            _app.UseMiddleware<SecurityHeadersMiddleware>(
                Blocks.Data.Api.Security.ContentSecurityPolicy.BuildPolicy([], [], []),
                Blocks.Data.Api.Security.StyleNonce.CreateWithRandomKey());
            var template = await SpaShell.ReadTemplateAsync(_webRoot);
            _app.Use((context, next) => SpaShell.InvokeAsync(context, next, template!));
            _app.UseStaticFiles();
            _app.MapFallback(RestUnsupportedMediaTypeMiddleware.SpaFallbackPattern, context => SpaShell.WriteAsync(context, template!))
                .WithMetadata(SpaShell.PageMethods);
            _app.UseMiddleware<RestUnsupportedMediaTypeMiddleware>();
            _app.UseRouting();
            _app.MapControllers();
            _app.Map("/api/gateway", context => context.Response.WriteAsync(GraphQLAnswer));
            await _app.StartAsync();

            _client = new HttpClient { BaseAddress = new Uri(_app.Urls.First()) };

            // The hosting layer's request activity: the one the request log is tagged onto.
            _listener = new ActivityListener
            {
                ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
                Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
                ActivityStopped = activity =>
                {
                    if (activity.TagObjects.FirstOrDefault(t => t.Key == "GatewayOperation").Value is Dictionary<string, object?> entry)
                        _logged.Enqueue(entry);
                },
            };
            ActivitySource.AddActivityListener(_listener);
        }

        public async Task DisposeAsync()
        {
            _listener?.Dispose();
            _client?.Dispose();
            if (_app is not null)
                await _app.DisposeAsync();
            if (_webRoot is not null)
                Directory.Delete(_webRoot, recursive: true);
        }

        public Task<HttpResponseMessage> SendAsync(
            string method, string path, string? body = null, string contentType = "application/json", string? bearer = null)
        {
            Service.Calls.Clear();
            var request = new HttpRequestMessage(new HttpMethod(method), path);
            if (body is not null)
                request.Content = new StringContent(body, Encoding.UTF8, contentType);
            if (bearer is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            return _client!.SendAsync(request);
        }

        // Program.cs's "api" prefix, with the Api project's own (internal) convention.
        private static IApplicationModelConvention ApiPrefixConvention()
        {
            var type = typeof(DataGatewayController).Assembly.GetType("BlocksTemplate.Api.GlobalApiRoutePrefixConvention", throwOnError: true)!;
            return (IApplicationModelConvention)Activator.CreateInstance(type, "api")!;
        }
    }

    /// <summary>Answers every operation with <c>{ "call": "…" }</c> naming what it received.</summary>
    public sealed class RecordingRestService : IGatewayRestService
    {
        public ConcurrentQueue<string> Calls { get; } = new();

        private Task<RestResult> Answer(string call)
        {
            Calls.Enqueue(call);
            return Task.FromResult(new RestResult(StatusCodes.Status200OK, new Dictionary<string, string> { ["call"] = call }));
        }

        public Task<RestResult> GetAsync(HttpContext http, string entity, JsonElement? body) =>
            Answer(body is null ? $"list {entity}" : $"query {entity}");

        public Task<RestResult> GetByIdAsync(HttpContext http, string entity, string itemId) => Answer($"getById {entity} {itemId}");

        public Task<RestResult> InsertAsync(HttpContext http, string entity, JsonElement body) => Answer($"insert {entity}");

        public Task<RestResult> InsertManyAsync(HttpContext http, string entity, JsonElement body) => Answer($"insertMany {entity}");

        public Task<RestResult> UpdateAsync(HttpContext http, string entity, string itemId, JsonElement body) => Answer($"update {entity} {itemId}");

        public Task<RestResult> UpdateManyAsync(HttpContext http, string entity, JsonElement body) => Answer($"updateMany {entity}");

        public Task<RestResult> UpsertAsync(HttpContext http, string entity, string itemId, JsonElement body) => Answer($"upsert {entity} {itemId}");

        public Task<RestResult> DeleteAsync(HttpContext http, string entity, string itemId, bool hardDelete) =>
            Answer($"delete {entity} {itemId} hard={hardDelete}");

        public Task<RestResult> DeleteManyAsync(HttpContext http, string entity, JsonElement body, bool hardDelete) =>
            Answer($"deleteMany {entity} hard={hardDelete}");
    }
}
