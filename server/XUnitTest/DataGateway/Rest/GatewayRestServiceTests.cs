using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using DataGateway.Rest;
using DataGateway.Rest.Entities;
using DataGateway.Rest.Errors;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.DataGateway.LockIn;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// The REST service end to end below the controller: caller and tenant, the entity, the access gate, parsing, the
/// column-rule guard, the engine and the mapping of its result, over the lock-in tenant in a throwaway Mongo database
/// with the real engine and policies. The cases that need an engine outcome Mongo cannot produce on demand (a count
/// that must not run, an unexpected failure) use a mocked engine.
/// </summary>
[Collection("Mongo")]
public class GatewayRestServiceTests : IDisposable
{
    private const string Tenant = GatewayLockInHarness.TenantId;

    private readonly MongoFixture _fixture;
    private readonly IMongoDatabase _db;
    private readonly GqlDbRepository _repository;
    private readonly Mock<IDataChangeEventPublisher> _publisher = new();
    private readonly Mock<IEntityModelProvider> _models = new();
    private readonly Activity _activity;

    public GatewayRestServiceTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        _repository = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);
        _activity = new Activity("rest-test").SetIdFormat(ActivityIdFormat.W3C).Start();
    }

    public void Dispose()
    {
        _activity.Dispose();
        try { _fixture.Client.DropDatabase(_db.DatabaseNamespace.DatabaseName); }
        catch { /* best effort */ }
        ClearContext();
        GC.SuppressFinalize(this);
    }

    // ---- set-up ----

    /// <summary>Seeds the lock-in tenant's rows and makes its entities available through the mocked model provider.</summary>
    private async Task<GatewayRestService> LockInServiceAsync(LockInTenant? tenant = null)
    {
        tenant ??= LockInTenant.Standard;
        foreach (var (collection, rows) in tenant.Seed)
            await _db.GetCollection<BsonDocument>(collection).InsertManyAsync(rows);
        foreach (var (collection, field) in tenant.GeoIndexes)
            await _db.GetCollection<BsonDocument>(collection).Indexes.CreateOneAsync(
                new CreateIndexModel<BsonDocument>(Builders<BsonDocument>.IndexKeys.Geo2DSphere(field)));

        BlocksTestContext.Set(tenantId: Tenant);
        var assembled = SchemaAssembler.Assemble(new SchemaSource
        {
            SchemaDefinitions = tenant.Schemas,
            DataValidations = tenant.Validations,
            DataAccessPolicies = tenant.Policies,
        });
        foreach (var entity in assembled.Where(s => s.SchemaType == SchemaType.Entity))
        {
            var others = assembled.Where(s => s.SchemaName != entity.SchemaName).ToDictionary(s => s.SchemaName);
            _models.Setup(m => m.GetAsync(Tenant, entity.SchemaName)).ReturnsAsync(new EntityModel(entity, null, others));
        }

        var engine = new MongoGatewayDataEngine(_repository, Resolver(), Principals(), NullLogger.Instance, eventPublisher: _publisher.Object);
        return Service(engine);
    }

    private GatewayRestService Service(IGatewayDataEngine engine, RestLimits? limits = null) =>
        new(engine, _models.Object, Resolver(), Principals(), Options.Create(limits ?? new RestLimits()), NullLogger<GatewayRestService>.Instance);

    /// <summary>A mocked engine and one entity, <c>Person</c>, served by the mocked model provider.</summary>
    private (GatewayRestService Service, Mock<IGatewayDataEngine> Engine) MockedService(SchemaDefinitionExtended? schema = null)
    {
        schema ??= Schema(fields: [Field("ItemId"), Field("Name"), Field("Email")]);
        _models.Setup(m => m.GetAsync(Tenant, schema.SchemaName)).ReturnsAsync(new EntityModel(schema, null));
        var engine = new Mock<IGatewayDataEngine>(MockBehavior.Strict);
        return (Service(engine.Object), engine);
    }

    /// <summary>
    /// The request as it reaches the service: the tenant's x-blocks-key (unless left out), and for a signed-in caller
    /// a bearer token the mocked authenticator accepts. Not async, so the ambient context it sets stays with the test.
    /// </summary>
    private static DefaultHttpContext Request(
        string method, string path, string? query = null, string? user = "u1", string[]? roles = null, bool blocksKey = true)
    {
        var authenticated = user is not null;
        RequestContextAccessor.Current = new RequestContext { BlocksKey = blocksKey ? Tenant : string.Empty, IsRequestFromBlocksCloud = false };
        SetContext(
            userId: user ?? string.Empty,
            userName: authenticated ? $"{user}@lockin.test" : string.Empty,
            tenantId: Tenant,
            isAuthenticated: authenticated,
            roles: roles ?? []);

        ClaimsPrincipal? principal = authenticated
            ? new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(BlocksContext.TENANT_ID_CLAIM, Tenant), new Claim(BlocksContext.USER_ID_CLAIM, user!)], "Bearer"))
            : null;
        var authenticator = new Mock<DataGatewayTokenAuthenticator>(
            new Mock<ITenants>().Object, new Mock<ICacheClient>().Object, new Mock<IHttpClientFactory>().Object, new Mock<IDbRepository>().Object);
        authenticator.Setup(a => a.GetPrincipalFromTokenAsync(It.IsAny<HttpRequest>(), It.IsAny<string>())).ReturnsAsync(principal);
        var services = new ServiceCollection();
        services.AddSingleton(authenticator.Object);

        var http = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        http.Request.Method = method;
        http.Request.Path = path;
        if (query is not null)
            http.Request.QueryString = new QueryString(query);
        if (blocksKey)
            http.Request.Headers["x-blocks-key"] = Tenant;
        if (authenticated)
            http.Request.Headers.Authorization = "Bearer test-token";
        return http;
    }

    private static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static JsonElement Body(RestResult result) => JsonSerializer.SerializeToElement(result.Body, result.Body!.GetType());

    private static GatewayProblem Problem(RestResult result) => result.Body.Should().BeOfType<GatewayProblem>().Subject;

    private static void ShouldBeProblem(RestResult result, int status, string code)
    {
        result.StatusCode.Should().Be(status);
        Problem(result).Code.Should().Be(code);
    }

    private async Task<BsonDocument?> StoredAsync(string collection, string id) =>
        await _db.GetCollection<BsonDocument>(collection).Find(new BsonDocument("_id", id)).FirstOrDefaultAsync();

    private Dictionary<string, object?> OperationTag()
    {
        var tag = _activity.TagObjects.FirstOrDefault(t => t.Key == "GatewayOperation").Value;
        return tag.Should().BeOfType<Dictionary<string, object?>>().Subject;
    }

    // ---- caller, tenant and entity ----

    [Fact]
    public async Task Anonymous_NonPublicEntity_401()
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("GET", "/api/gateway/Product", user: null), "Product", null);

        ShouldBeProblem(result, 401, "AUTH_NOT_AUTHENTICATED");
    }

    [Fact]
    public async Task Anonymous_UnknownEntity_401()
    {
        var service = await LockInServiceAsync();

        var unknown = await service.GetAsync(Request("GET", "/api/gateway/Nope", user: null), "Nope", null);
        var notPublic = await service.GetAsync(Request("GET", "/api/gateway/Product", user: null), "Product", null);

        ShouldBeProblem(unknown, 401, "AUTH_NOT_AUTHENTICATED");
        // Nothing tells an unknown entity apart from one that is not public.
        Problem(unknown).Detail.Should().Be(Problem(notPublic).Detail);
    }

    [Fact]
    public async Task Authenticated_UnknownEntity_404()
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("GET", "/api/gateway/Nope"), "Nope", null);

        ShouldBeProblem(result, 404, "NOT_FOUND");
    }

    // An entity name that no schema can have (the rule schemas are created under) is refused as an unknown entity:
    // the same answer, and no lookup of the name at all.
    public static TheoryData<string> InvalidEntityNames => new()
    {
        "Bad-Name",
        "1Starts",
        "has space",
        "..",
        new string('A', 51),
        "Nämé",
    };

    [Theory]
    [MemberData(nameof(InvalidEntityNames))]
    public async Task InvalidEntityName_Anonymous_401SameAsUnknown(string name)
    {
        var service = await LockInServiceAsync();

        var invalid = await service.GetAsync(Request("GET", "/api/gateway/x", user: null), name, null);
        var unknown = await service.GetAsync(Request("GET", "/api/gateway/Nope", user: null), "Nope", null);

        ShouldBeProblem(invalid, 401, "AUTH_NOT_AUTHENTICATED");
        Problem(invalid).Detail.Should().Be(Problem(unknown).Detail);
    }

    [Theory]
    [MemberData(nameof(InvalidEntityNames))]
    public async Task InvalidEntityName_Authenticated_404(string name)
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("GET", "/api/gateway/x"), name, null);

        ShouldBeProblem(result, 404, "NOT_FOUND");
    }

    [Theory]
    [MemberData(nameof(InvalidEntityNames))]
    public async Task InvalidEntityName_NoProviderCall(string name)
    {
        var models = new Mock<IEntityModelProvider>(MockBehavior.Strict);
        var service = new GatewayRestService(
            new Mock<IGatewayDataEngine>(MockBehavior.Strict).Object, models.Object, Resolver(), Principals(),
            Options.Create(new RestLimits()), NullLogger<GatewayRestService>.Instance);

        var anonymous = await service.GetAsync(Request("GET", "/api/gateway/x", user: null), name, null);
        var authenticated = await service.GetAsync(Request("GET", "/api/gateway/x"), name, null);

        anonymous.StatusCode.Should().Be(401);
        authenticated.StatusCode.Should().Be(404);
        models.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Anonymous_PublicEntity_Allowed()
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("GET", "/api/gateway/Note", user: null), "Note", null);

        result.StatusCode.Should().Be(200);
        Body(result).GetProperty("items")[0].GetProperty("Text").GetString().Should().Be("Hello");
    }

    [Fact]
    public async Task MissingBlocksKey_401()
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("GET", "/api/gateway/Note", blocksKey: false), "Note", null);

        ShouldBeProblem(result, 401, "AUTH_NOT_AUTHENTICATED");
        _models.Verify(m => m.GetAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Tenant_IsPinnedOnTheRequestContext()
    {
        var service = await LockInServiceAsync();
        var http = Request("GET", "/api/gateway/Note");

        await service.GetAsync(http, "Note", null);

        RequestContextAccessor.Current.TenantId.Should().Be(Tenant);
    }

    [Theory]
    [InlineData("bad id!")]
    [InlineData("a/b")]
    [InlineData("")]
    [InlineData("x0123456789012345678901234567890123456789012345678901234567890123")]
    public async Task InvalidItemId_400(string itemId)
    {
        var service = await LockInServiceAsync();

        var result = await service.GetByIdAsync(Request("GET", "/api/gateway/Product/item/x"), "Product", itemId);

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        _models.Verify(m => m.GetAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ValidItemId_SixtyFourCharacters_Accepted()
    {
        var service = await LockInServiceAsync();
        var itemId = new string('a', 60) + "_-Z9";

        var result = await service.GetByIdAsync(Request("GET", $"/api/gateway/Product/item/{itemId}"), "Product", itemId);

        ShouldBeProblem(result, 404, "NOT_FOUND");
    }

    // ---- access ----

    [Fact]
    public async Task AccessLevelDenied_403()
    {
        // Delete is Custom; without a delete row rule nobody is granted it.
        var tenant = LockInTenant.Standard;
        tenant.Policies.RemoveAll(p => p.Operation == PolicyOperation.DELETE);
        var service = await LockInServiceAsync(tenant);

        var result = await service.DeleteAsync(Request("DELETE", "/api/gateway/Product/item/p1"), "Product", "p1", hardDelete: true);

        ShouldBeProblem(result, 403, "FORBIDDEN");
        (await StoredAsync("Products", "p1")).Should().NotBeNull();
    }

    [Fact]
    public async Task Anonymous_WriteNeedsAuthentication_401_BeforeTheBodyIsRead()
    {
        var service = await LockInServiceAsync();

        // Not even a valid record: the gate refuses before the body is read.
        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item", user: null), "Product", Json("""{ "Nope": 1 }"""));

        ShouldBeProblem(result, 401, "AUTH_NOT_AUTHENTICATED");
    }

    [Theory]
    [InlineData(SchemaAccessLevel.Public, SchemaAccessLevel.User)]
    [InlineData(SchemaAccessLevel.User, SchemaAccessLevel.Public)]
    public async Task Upsert_NeedsBothWriteAndEditAccess(SchemaAccessLevel write, SchemaAccessLevel edit)
    {
        var (service, engine) = MockedService(Schema(write: write, edit: edit, fields: [Field("ItemId"), Field("Name")]));

        var result = await service.UpsertAsync(Request("PUT", "/api/gateway/Person/item/p1", user: null), "Person", "p1", Json("""{ "Name": "Ann" }"""));

        ShouldBeProblem(result, 401, "AUTH_NOT_AUTHENTICATED");
        engine.VerifyNoOtherCalls();
    }

    // ---- column rules ----

    [Fact]
    public async Task ColumnRule_WhereOnMaskedField_403()
    {
        var service = await LockInServiceAsync();

        var byWhere = await service.GetAsync(Request("POST", "/api/gateway/Product"), "Product",
            Json("""{ "where": { "Secret": { "eq": "s-one" } } }"""));
        var byOrder = await service.GetAsync(Request("GET", "/api/gateway/Product", "?order=Secret:DESC"), "Product", null);
        var byBulkWhere = await service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items"), "Product",
            Json("""{ "where": { "Secret": { "eq": "s-one" } } }"""), hardDelete: true);

        ShouldBeProblem(byWhere, 403, "FORBIDDEN");
        ShouldBeProblem(byOrder, 403, "FORBIDDEN");
        ShouldBeProblem(byBulkWhere, 403, "FORBIDDEN");
        (await StoredAsync("Products", "p1")).Should().NotBeNull();
    }

    [Fact]
    public async Task ColumnRule_SelectMaskedField_MaskedLikeGraphQL()
    {
        var service = await LockInServiceAsync();

        var asUser = await service.GetAsync(Request("GET", "/api/gateway/Product", "?select=ItemId,Secret&order=Title"), "Product", null);
        var asAdmin = await service.GetAsync(Request("GET", "/api/gateway/Product", "?select=ItemId,Secret&order=Title", roles: ["admin"]), "Product", null);

        asUser.StatusCode.Should().Be(200);
        var userItems = Body(asUser).GetProperty("items").EnumerateArray().ToList();
        // The row rules leave u1 its own rows; the column rule masks Secret on each, as GraphQL returns null for it.
        userItems.Select(i => i.GetProperty("ItemId").GetString()).Should().Equal("p1", "p3");
        foreach (var item in userItems)
        {
            var secret = item.TryGetProperty("Secret", out var value) ? value : default;
            secret.ValueKind.Should().BeOneOf(JsonValueKind.Undefined, JsonValueKind.Null);
        }

        var adminItems = Body(asAdmin).GetProperty("items").EnumerateArray().ToList();
        adminItems.Select(i => i.GetProperty("Secret").GetString()).Should().Equal("s-one", "s-two", "s-three");
    }

    // ---- bulk safety ----

    [Theory]
    [InlineData("""{ "input": { "Price": 1 } }""")]
    [InlineData("""{ "where": {}, "input": { "Price": 1 } }""")]
    [InlineData("""{ "where": null, "input": { "Price": 1 } }""")]
    public async Task UpdateMany_EmptyWhere_400(string body)
    {
        var service = await LockInServiceAsync();

        var result = await service.UpdateManyAsync(Request("PATCH", "/api/gateway/Product/items", roles: ["admin"]), "Product", Json(body));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        (await StoredAsync("Products", "p1"))!["Price"].AsDouble.Should().Be(10.5);
    }

    [Fact]
    public async Task DeleteMany_MissingBody_400()
    {
        var service = await LockInServiceAsync();

        var missing = await service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items", roles: ["admin"]), "Product", default, hardDelete: true);
        var emptyWhere = await service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items", roles: ["admin"]), "Product", Json("{}"), hardDelete: true);

        ShouldBeProblem(missing, 400, "VALIDATION_ERROR");
        ShouldBeProblem(emptyWhere, 400, "VALIDATION_ERROR");
        (await _db.GetCollection<BsonDocument>("Products").CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3);
    }

    [Fact]
    public async Task UpdateMany_WithWhere_UpdatesTheVisibleRows()
    {
        var service = await LockInServiceAsync();

        var result = await service.UpdateManyAsync(Request("PATCH", "/api/gateway/Product/items"), "Product",
            Json("""{ "where": { "Status": { "eq": "Draft" } }, "input": { "Stock": 99 } }"""));

        result.StatusCode.Should().Be(200);
        Body(result).GetProperty("acknowledged").GetBoolean().Should().BeTrue();
        Body(result).GetProperty("totalImpactedData").GetInt64().Should().Be(1);
        (await StoredAsync("Products", "p1"))!["Stock"].AsInt32.Should().Be(99);
        (await StoredAsync("Products", "p2"))!["Stock"].AsInt32.Should().Be(0);
    }

    [Fact]
    public async Task DeleteMany_BoundByReadRules_SkipsUnreadableRows()
    {
        // Delete open to every signed-in user, read limited to own rows: a bulk delete reaches only the readable rows.
        var tenant = LockInTenant.Standard;
        tenant.Schemas.Single(s => s.SchemaName == "Product").DeleteAccessLevel = SchemaAccessLevel.User;
        tenant.Policies.RemoveAll(p => p.Operation == PolicyOperation.DELETE);
        var service = await LockInServiceAsync(tenant);

        var result = await service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items"), "Product",
            Json("""{ "where": { "Status": { "eq": "Draft" } } }"""), hardDelete: true);

        result.StatusCode.Should().Be(200);
        Body(result).GetProperty("totalImpactedData").GetInt64().Should().Be(1);
        (await StoredAsync("Products", "p1")).Should().BeNull();
        (await StoredAsync("Products", "p2")).Should().NotBeNull();
    }

    [Fact]
    public async Task UpdateMany_NoMatch_200ZeroImpacted()
    {
        // A bulk write that matches nothing is not an error: the same shape as any other bulk result (R33).
        var service = await LockInServiceAsync();

        var result = await service.UpdateManyAsync(Request("PATCH", "/api/gateway/Product/items"), "Product",
            Json("""{ "where": { "Title": { "eq": "No such title" } }, "input": { "Stock": 99 } }"""));

        result.StatusCode.Should().Be(200);
        var body = Body(result);
        body.GetProperty("acknowledged").GetBoolean().Should().BeFalse();
        body.GetProperty("totalImpactedData").GetInt64().Should().Be(0);
        body.TryGetProperty("itemIds", out _).Should().BeFalse();
        (await StoredAsync("Products", "p1"))!["Stock"].AsInt32.Should().NotBe(99);
    }

    [Fact]
    public async Task DeleteMany_NoMatch_200ZeroImpacted()
    {
        var service = await LockInServiceAsync();

        var result = await service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items", roles: ["admin"]), "Product",
            Json("""{ "where": { "Title": { "eq": "No such title" } } }"""), hardDelete: true);

        result.StatusCode.Should().Be(200);
        var body = Body(result);
        body.GetProperty("acknowledged").GetBoolean().Should().BeFalse();
        body.GetProperty("totalImpactedData").GetInt64().Should().Be(0);
        (await _db.GetCollection<BsonDocument>("Products").CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3);
    }

    // ---- reads ----

    [Fact]
    public async Task Get_IncludeTotalCountFalse_NoCountRun()
    {
        var (service, engine) = MockedService();
        var counted = 0;
        engine.Setup(e => e.QueryAsync(It.IsAny<EntityModel>(), It.IsAny<QueryCommand>()))
            .ReturnsAsync(() => new QueryResponse<Dictionary<string, object>>
            {
                Items = [new() { ["_id"] = "p1", ["Name"] = "Ann" }],
                PageNo = 1,
                PageSize = 10,
                TotalCountProvider = () => { counted++; return Task.FromResult(25L); },
            });

        var withoutCount = await service.GetAsync(Request("GET", "/api/gateway/Person"), "Person", null);

        counted.Should().Be(0);
        var body = Body(withoutCount);
        body.GetProperty("items")[0].GetProperty("ItemId").GetString().Should().Be("p1");
        body.GetProperty("pageNo").GetInt32().Should().Be(1);
        body.GetProperty("pageSize").GetInt32().Should().Be(10);
        body.GetProperty("hasPreviousPage").GetBoolean().Should().BeFalse();
        body.TryGetProperty("totalCount", out _).Should().BeFalse();
        body.TryGetProperty("totalPages", out _).Should().BeFalse();
        body.TryGetProperty("hasNextPage", out _).Should().BeFalse();

        var withCount = Body(await service.GetAsync(Request("GET", "/api/gateway/Person", "?includeTotalCount=true"), "Person", null));

        counted.Should().Be(1);
        withCount.GetProperty("totalCount").GetInt64().Should().Be(25);
        withCount.GetProperty("totalPages").GetInt32().Should().Be(3);
        withCount.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Get_Body_FiltersOrdersAndPages()
    {
        var service = await LockInServiceAsync();

        var result = await service.GetAsync(Request("POST", "/api/gateway/Product", roles: ["admin"]), "Product", Json("""
            { "where": { "Price": { "gte": 20 } }, "order": [{ "field": "Price", "direction": "DESC" }],
              "paging": { "pageNo": 1, "pageSize": 1 }, "select": ["Title"], "includeTotalCount": true }
            """));

        result.StatusCode.Should().Be(200);
        var body = Body(result);
        body.GetProperty("items").GetArrayLength().Should().Be(1);
        body.GetProperty("items")[0].GetProperty("Title").GetString().Should().Be("Charlie");
        body.GetProperty("items")[0].GetProperty("ItemId").GetString().Should().Be("p3");
        body.GetProperty("totalCount").GetInt64().Should().Be(2);
        body.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task GetById_FoundAndHidden()
    {
        var service = await LockInServiceAsync();

        var own = await service.GetByIdAsync(Request("GET", "/api/gateway/Product/item/p1", "?select=Title"), "Product", "p1");
        var hidden = await service.GetByIdAsync(Request("GET", "/api/gateway/Product/item/p2"), "Product", "p2");

        own.StatusCode.Should().Be(200);
        Body(own).GetProperty("Title").GetString().Should().Be("Alpha");
        Body(own).GetProperty("ItemId").GetString().Should().Be("p1");
        ShouldBeProblem(hidden, 404, "NOT_FOUND");
    }

    // ---- writes ----

    [Fact]
    public async Task Insert_Returns201WithLocation()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item"), "Product", Json("""{ "Title": "Lamp", "Price": 5 }"""));

        result.StatusCode.Should().Be(201);
        var body = Body(result);
        body.GetProperty("acknowledged").GetBoolean().Should().BeTrue();
        var itemId = body.GetProperty("itemId").GetString();
        itemId.Should().NotBeNullOrEmpty();
        result.Location.Should().Be($"/api/gateway/Product/item/{itemId}");
        (await StoredAsync("Products", itemId!))!["Title"].AsString.Should().Be("Lamp");
    }

    [Fact]
    public async Task InsertMany_Returns200WithItemIds()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertManyAsync(Request("POST", "/api/gateway/Product/items"), "Product",
            Json("""[{ "ItemId": "p7", "Title": "Lamp" }, { "ItemId": "p8", "Title": "Desk" }]"""));

        result.StatusCode.Should().Be(200);
        var body = Body(result);
        body.GetProperty("totalImpactedData").GetInt64().Should().Be(2);
        body.GetProperty("itemIds").EnumerateArray().Select(i => i.GetString()).Should().BeEquivalentTo(["p7", "p8"]);
    }

    [Fact]
    public async Task Upsert_CreatedVs_Updated_StatusCodes()
    {
        var service = await LockInServiceAsync();

        var created = await service.UpsertAsync(Request("PUT", "/api/gateway/Product/item/p9"), "Product", "p9", Json("""{ "Title": "Lamp" }"""));
        var updated = await service.UpsertAsync(Request("PUT", "/api/gateway/Product/item/p1"), "Product", "p1", Json("""{ "ItemId": "p1", "Price": 99 }"""));

        created.StatusCode.Should().Be(201);
        created.Location.Should().Be("/api/gateway/Product/item/p9");
        Body(created).GetProperty("created").GetBoolean().Should().BeTrue();
        Body(created).GetProperty("itemId").GetString().Should().Be("p9");

        updated.StatusCode.Should().Be(200);
        updated.Location.Should().BeNull();
        Body(updated).GetProperty("created").GetBoolean().Should().BeFalse();
        (await StoredAsync("Products", "p1"))!["Price"].AsDouble.Should().Be(99);
        (await StoredAsync("Products", "p1"))!["Title"].AsString.Should().Be("Alpha");
    }

    [Fact]
    public async Task Upsert_BodyItemIdDiffersFromRoute_400()
    {
        var service = await LockInServiceAsync();

        var result = await service.UpsertAsync(Request("PUT", "/api/gateway/Product/item/p1"), "Product", "p1", Json("""{ "ItemId": "p2", "Price": 1 }"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        (await StoredAsync("Products", "p2"))!["Price"].AsDouble.Should().Be(20.0);
    }

    private const string ItemIdRuleMessage = "Field 'ItemId' must be 1-64 characters of letters, digits, '_' or '-'.";

    [Theory]
    [InlineData("has space")]
    [InlineData("a/b")]
    [InlineData("")]
    [InlineData("x123456789x123456789x123456789x123456789x123456789x123456789x1234")]
    public async Task Insert_BodyItemIdOutsideRule_400(string itemId)
    {
        // A record whose id the item routes cannot address would be reachable only through the list and bulk routes (R34).
        var service = await LockInServiceAsync();

        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item"), "Product",
            Json($$"""{ "ItemId": {{JsonSerializer.Serialize(itemId)}}, "Title": "Lamp" }"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        var problem = Problem(result);
        problem.Detail.Should().Be(ItemIdRuleMessage);
        var error = problem.Errors.Should().ContainSingle().Subject;
        error.Field.Should().Be("ItemId");
        error.Message.Should().Be(ItemIdRuleMessage);
        (await _db.GetCollection<BsonDocument>("Products").CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3);
    }

    [Fact]
    public async Task InsertMany_BodyItemIdOutsideRule_400NamesItem()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertManyAsync(Request("POST", "/api/gateway/Product/items"), "Product",
            Json("""[{ "ItemId": "p7", "Title": "Lamp" }, { "ItemId": "p 8", "Title": "Desk" }]"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        var problem = Problem(result);
        // Prefixed with the record's position, as every other per-record error of a bulk insert is.
        problem.Detail.Should().Be("Item 1: " + ItemIdRuleMessage);
        var error = problem.Errors.Should().ContainSingle().Subject;
        error.Field.Should().Be("[1].ItemId");
        error.Message.Should().Be("Item 1: " + ItemIdRuleMessage);
        (await StoredAsync("Products", "p7")).Should().BeNull();
    }

    [Fact]
    public async Task Upsert_BodyItemIdOutsideRule_400()
    {
        // Checked before the route match, so the caller learns why the id is refused.
        var service = await LockInServiceAsync();

        var result = await service.UpsertAsync(Request("PUT", "/api/gateway/Product/item/p1"), "Product", "p1",
            Json("""{ "ItemId": "p 1", "Price": 1 }"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        var problem = Problem(result);
        problem.Detail.Should().Be(ItemIdRuleMessage);
        var error = problem.Errors.Should().ContainSingle().Subject;
        error.Field.Should().Be("ItemId");
        error.Message.Should().Be(ItemIdRuleMessage);
        (await StoredAsync("Products", "p1"))!["Price"].AsDouble.Should().Be(10.5);
    }

    [Fact]
    public async Task Upsert_HiddenByRowRules_404()
    {
        var service = await LockInServiceAsync();

        var result = await service.UpsertAsync(Request("PUT", "/api/gateway/Product/item/p2"), "Product", "p2", Json("""{ "Price": 1 }"""));

        ShouldBeProblem(result, 404, "NOT_FOUND");
        (await StoredAsync("Products", "p2"))!["Price"].AsDouble.Should().Be(20.0);
    }

    [Fact]
    public async Task Update_NoMatch_404()
    {
        var service = await LockInServiceAsync();

        var missing = await service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/nope"), "Product", "nope", Json("""{ "Price": 1 }"""));
        var hidden = await service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p2"), "Product", "p2", Json("""{ "Price": 1 }"""));

        ShouldBeProblem(missing, 404, "NOT_FOUND");
        ShouldBeProblem(hidden, 404, "NOT_FOUND");
    }

    [Fact]
    public async Task Update_Own_Returns200()
    {
        var service = await LockInServiceAsync();

        var result = await service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p1"), "Product", "p1", Json("""{ "Price": 1 }"""));

        result.StatusCode.Should().Be(200);
        Body(result).GetProperty("itemId").GetString().Should().Be("p1");
        (await StoredAsync("Products", "p1"))!["Price"].AsDouble.Should().Be(1);
    }

    [Fact]
    public async Task Delete_Soft_ThenNotFound()
    {
        var service = await LockInServiceAsync();

        var soft = await service.DeleteAsync(Request("DELETE", "/api/gateway/Product/item/p1"), "Product", "p1", hardDelete: false);
        var again = await service.DeleteAsync(Request("DELETE", "/api/gateway/Product/item/p1"), "Product", "p1", hardDelete: false);

        soft.StatusCode.Should().Be(200);
        Body(soft).GetProperty("itemId").GetString().Should().Be("p1");
        ShouldBeProblem(again, 404, "NOT_FOUND");
        (await StoredAsync("Products", "p1")).Should().BeNull();
    }

    [Fact]
    public async Task Unique_409()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item"), "Product", Json("""{ "ItemId": "p9", "Title": "Alpha" }"""));

        ShouldBeProblem(result, 409, "VALIDATION_ERROR");
        Problem(result).Errors.Should().OnlyContain(e => e.ValidationType == "Unique");
    }

    [Fact]
    public async Task Validation_400_WithErrorObjects()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item"), "Product", Json("""{ "ItemId": "p9", "Title": "" }"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        var errors = Body(result).GetProperty("errors");
        errors.GetArrayLength().Should().BeGreaterThan(0);
        foreach (var error in errors.EnumerateArray())
        {
            error.ValueKind.Should().Be(JsonValueKind.Object);
            error.GetProperty("field").GetString().Should().Be("Title");
            error.GetProperty("message").GetString().Should().NotBeNullOrEmpty();
            error.GetProperty("validationType").GetString().Should().NotBeNullOrEmpty();
        }
    }

    [Fact]
    public async Task UnknownBodyField_400()
    {
        var service = await LockInServiceAsync();

        var result = await service.InsertAsync(Request("POST", "/api/gateway/Product/item"), "Product", Json("""{ "Titel": "Lamp" }"""));

        ShouldBeProblem(result, 400, "VALIDATION_ERROR");
        Problem(result).Errors.Should().ContainSingle().Which.Field.Should().Be("Titel");
    }

    [Fact]
    public async Task Unhandled_500_NoInternalMessage()
    {
        var (service, engine) = MockedService();
        engine.Setup(e => e.QueryAsync(It.IsAny<EntityModel>(), It.IsAny<QueryCommand>()))
            .ThrowsAsync(new InvalidOperationException("mongodb://admin:pa55word@db-1 timed out"));

        var result = await service.GetAsync(Request("GET", "/api/gateway/Person"), "Person", null);

        ShouldBeProblem(result, 500, "INTERNAL_ERROR");
        Body(result).GetRawText().Should().NotContain("pa55word").And.NotContain("mongodb");
        OperationTag()["FailureKind"].Should().Be(GatewayFailureKind.Unhandled);
    }

    // ---- commands ----

    [Fact]
    public async Task Commands_CarryGraphQlStyleOperationNames()
    {
        var (service, engine) = MockedService();
        var names = new List<string>();
        var ok = new ActionResponse { Acknowledged = true, ItemId = "p1" };
        engine.Setup(e => e.QueryAsync(It.IsAny<EntityModel>(), It.IsAny<QueryCommand>()))
            .Callback<EntityModel, QueryCommand>((_, c) => names.Add(c.OperationName))
            .ReturnsAsync(new QueryResponse<Dictionary<string, object>>());
        engine.Setup(e => e.GetByIdAsync(It.IsAny<EntityModel>(), "p1", It.IsAny<IReadOnlyList<string>>(), It.IsAny<string>()))
            .Callback<EntityModel, string, IReadOnlyList<string>, string>((_, _, _, n) => names.Add(n))
            .ReturnsAsync(new Dictionary<string, object> { ["_id"] = "p1" });
        engine.Setup(e => e.InsertAsync(It.IsAny<EntityModel>(), It.IsAny<InsertCommand>()))
            .Callback<EntityModel, InsertCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(ok);
        engine.Setup(e => e.InsertManyAsync(It.IsAny<EntityModel>(), It.IsAny<InsertManyCommand>()))
            .Callback<EntityModel, InsertManyCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(new BulkActionResponse { Acknowledged = true });
        engine.Setup(e => e.UpdateAsync(It.IsAny<EntityModel>(), It.IsAny<UpdateCommand>()))
            .Callback<EntityModel, UpdateCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(ok);
        engine.Setup(e => e.UpdateManyAsync(It.IsAny<EntityModel>(), It.IsAny<UpdateManyCommand>()))
            .Callback<EntityModel, UpdateManyCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(ok);
        engine.Setup(e => e.UpsertAsync(It.IsAny<EntityModel>(), It.IsAny<UpsertCommand>()))
            .Callback<EntityModel, UpsertCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(new UpsertResult(ok, false));
        engine.Setup(e => e.DeleteAsync(It.IsAny<EntityModel>(), It.IsAny<DeleteCommand>()))
            .Callback<EntityModel, DeleteCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(ok);
        engine.Setup(e => e.DeleteManyAsync(It.IsAny<EntityModel>(), It.IsAny<DeleteManyCommand>()))
            .Callback<EntityModel, DeleteManyCommand>((_, c) => names.Add(c.OperationName)).ReturnsAsync(ok);
        var record = Json("""{ "Name": "Ann" }""");
        var where = Json("""{ "where": { "Name": { "eq": "Ann" } }, "input": { "Name": "Bob" } }""");

        await service.GetAsync(Request("GET", "/x"), "Person", null);
        await service.GetByIdAsync(Request("GET", "/x"), "Person", "p1");
        await service.InsertAsync(Request("POST", "/x"), "Person", record);
        await service.InsertManyAsync(Request("POST", "/x"), "Person", Json("""[{ "Name": "Ann" }]"""));
        await service.UpdateAsync(Request("PATCH", "/x"), "Person", "p1", record);
        await service.UpdateManyAsync(Request("PATCH", "/x"), "Person", where);
        await service.UpsertAsync(Request("PUT", "/x"), "Person", "p1", record);
        await service.DeleteAsync(Request("DELETE", "/x"), "Person", "p1", hardDelete: false);
        await service.DeleteManyAsync(Request("DELETE", "/x"), "Person", Json("""{ "where": { "Name": { "eq": "Ann" } } }"""), hardDelete: true);

        names.Should().Equal(
            "getPersons", "getPersons", "insertPerson", "insertManyPerson", "updatePerson",
            "updateManyPerson", "upsertPerson", "deletePerson", "deleteManyPerson");
    }

    [Fact]
    public async Task UpdateAndDeleteById_FilterOnItemId()
    {
        var (service, engine) = MockedService();
        var wheres = new List<WhereNode?>();
        var deleteHard = new List<bool>();
        var ok = new ActionResponse { Acknowledged = true, ItemId = "p1" };
        engine.Setup(e => e.UpdateAsync(It.IsAny<EntityModel>(), It.IsAny<UpdateCommand>()))
            .Callback<EntityModel, UpdateCommand>((_, c) => wheres.Add(c.Where)).ReturnsAsync(ok);
        engine.Setup(e => e.DeleteAsync(It.IsAny<EntityModel>(), It.IsAny<DeleteCommand>()))
            .Callback<EntityModel, DeleteCommand>((_, c) => { wheres.Add(c.Where); deleteHard.Add(c.HardDelete); }).ReturnsAsync(ok);

        await service.UpdateAsync(Request("PATCH", "/x"), "Person", "p1", Json("""{ "Name": "Bob" }"""));
        await service.DeleteAsync(Request("DELETE", "/x"), "Person", "p1", hardDelete: true);

        foreach (var where in wheres)
        {
            where!.Root.Should().ContainKey("ItemId");
            where.Root["ItemId"].Should().BeEquivalentTo(new Dictionary<string, object?> { ["eq"] = "p1" });
        }
        deleteHard.Should().Equal(true);
    }

    // ---- request log ----

    [Fact]
    public async Task Log_TaggedWithTransportRestAndMaskedPii()
    {
        var email = Field("Email");
        email.IsPIIData = true;
        var (service, engine) = MockedService(Schema(fields: [Field("ItemId"), Field("Name"), email]));
        engine.Setup(e => e.InsertAsync(It.IsAny<EntityModel>(), It.IsAny<InsertCommand>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "p1" });

        var result = await service.InsertAsync(
            Request("POST", "/api/gateway/Person/item", "?trace=1"), "Person",
            Json("""{ "Name": "Ann Example", "Email": "john.doe@example.com" }"""));

        result.StatusCode.Should().Be(201);
        var tag = OperationTag();
        tag["Transport"].Should().Be("rest");
        tag["OperationType"].Should().Be("mutation");
        tag["SchemaName"].Should().Be("insertPerson");
        tag["EntityName"].Should().Be("Person");
        tag["ResponseStatus"].Should().Be("success");
        var query = tag["OperationQuery"].Should().BeOfType<string>().Subject;
        query.Should().StartWith("POST /api/gateway/Person/item?trace=1");
        query.Should().Contain("Ann Example");
        query.Should().Contain(LogMasking.MaskText("john.doe@example.com"));
        query.Should().NotContain("john.doe@example.com");
    }

    [Fact]
    public async Task Log_Rejection_MarkedFailedWithItsKind()
    {
        var service = await LockInServiceAsync();

        await service.GetAsync(Request("GET", "/api/gateway/Product", user: null), "Product", null);

        var tag = OperationTag();
        tag["Transport"].Should().Be("rest");
        tag["OperationType"].Should().Be("query");
        tag["SchemaName"].Should().Be("getProducts");
        tag["ResponseStatus"].Should().Be("failed");
        tag["FailureKind"].Should().Be(GatewayFailureKind.Authentication);
        tag["FailureCode"].Should().Be("AUTH_NOT_AUTHENTICATED");
    }

    [Fact]
    public async Task Log_LongBody_TruncatedTo8192()
    {
        var (service, engine) = MockedService();
        engine.Setup(e => e.InsertAsync(It.IsAny<EntityModel>(), It.IsAny<InsertCommand>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "p1" });

        await service.InsertAsync(Request("POST", "/api/gateway/Person/item"), "Person",
            Json($$"""{ "Name": "{{new string('n', 20000)}}" }"""));

        OperationTag()["OperationQuery"].Should().BeOfType<string>().Which.Length.Should().Be(8192);
    }

    [Fact]
    public void GatewayOperation_NullTransport_OmittedFromTag()
    {
        using var graphQl = new Activity("graphql").Start();
        GatewayOperationActivity.Tag(graphQl, new GatewayOperation { SchemaName = "getPersons" });
        var graphQlTag = (Dictionary<string, object?>)graphQl.TagObjects.Single(t => t.Key == "GatewayOperation").Value!;

        using var rest = new Activity("rest").Start();
        GatewayOperationActivity.Tag(rest, new GatewayOperation { SchemaName = "getPersons", Transport = "rest" });
        var restTag = (Dictionary<string, object?>)rest.TagObjects.Single(t => t.Key == "GatewayOperation").Value!;

        graphQlTag.Should().NotContainKey("Transport");
        restTag["Transport"].Should().Be("rest");
    }

    // ---- registration ----

    private static ServiceProvider Registered(Dictionary<string, string?> settings)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var services = new ServiceCollection();
        services.AddDataGatewayRest(configuration);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void AddDataGatewayRest_BindsLimitsAndCacheOptions()
    {
        using var provider = Registered(new()
        {
            ["DataGateway:Rest:MaxPageSize"] = "50",
            ["DataGateway:Rest:EntityViewCache:MaxEntries"] = "7",
        });

        provider.GetRequiredService<IOptions<RestLimits>>().Value.MaxPageSize.Should().Be(50);
        provider.GetRequiredService<IOptions<RestLimits>>().Value.DefaultPageSize.Should().Be(10);
        provider.GetRequiredService<IOptions<EntityViewCacheOptions>>().Value.MaxEntries.Should().Be(7);
    }

    [Theory]
    [InlineData("DataGateway:Rest:MaxPageSize", "0")]
    [InlineData("DataGateway:Rest:DefaultPageSize", "-1")]
    [InlineData("DataGateway:Rest:MaxBulkItems", "0")]
    [InlineData("DataGateway:Rest:MaxRequestBodyBytes", "0")]
    [InlineData("DataGateway:Rest:MaxWhereDepth", "0")]
    [InlineData("DataGateway:Rest:MaxWhereConditions", "0")]
    [InlineData("DataGateway:Rest:EntityViewCache:MaxEntries", "0")]
    [InlineData("DataGateway:Rest:EntityViewCache:SlidingExpirationMinutes", "0")]
    public void AddDataGatewayRest_InvalidSetting_FailsAtStartup(string key, string value)
    {
        using var provider = Registered(new() { [key] = value });

        var validate = () => provider.GetRequiredService<IStartupValidator>().Validate();

        validate.Should().Throw<OptionsValidationException>();
    }

    [Fact]
    public void AddDataGatewayRest_DefaultSettings_PassStartupValidation()
    {
        using var provider = Registered([]);

        var validate = () => provider.GetRequiredService<IStartupValidator>().Validate();

        validate.Should().NotThrow();
    }
}
