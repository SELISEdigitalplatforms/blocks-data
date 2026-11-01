using System.Diagnostics;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using HotChocolate.Execution;
using HotChocolate.Execution.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.LockIn;

/// <summary>Who sends the request: nobody in particular, or a signed-in user with roles.</summary>
public sealed record LockInCaller(bool Authenticated, string? UserId, string[] Roles)
{
    public static LockInCaller Anonymous { get; } = new(false, null, []);

    public static LockInCaller User(string id, params string[] roles) => new(true, id, roles);
}

/// <summary>
/// Everything one request left behind, as normalised JSON text: the GraphQL response, the data collections afterwards,
/// the data-change events published, and the request-log summary (the "GatewayOperation" tag).
/// </summary>
public sealed record LockInResult(string ResponseJson, string MongoAfterJson, string EventsJson, string OperationTagsJson)
{
    /// <summary>The four parts combined into one indented JSON object, the text a golden file holds.</summary>
    public string ToGoldenJson()
    {
        var golden = new JsonObject
        {
            ["response"] = JsonNode.Parse(ResponseJson),
            ["mongoAfter"] = JsonNode.Parse(MongoAfterJson),
            ["events"] = JsonNode.Parse(EventsJson),
            ["operationTags"] = JsonNode.Parse(OperationTagsJson),
        };
        return golden.ToJsonString(GatewayLockInHarness.Indented);
    }
}

/// <summary>
/// Runs GraphQL documents through the real gateway code path: a schema built from drafts by
/// <see cref="GraphqlSchemaBuilder"/>, the real <see cref="QueryService"/> and <see cref="MutationService"/> with the real
/// policy resolver, and a real <see cref="GqlDbRepository"/> over a throwaway Mongo database. Only the data-change
/// publisher is replaced, by a recorder. Used to lock in today's behaviour before the GraphQL code is split out.
/// </summary>
public sealed class GatewayLockInHarness : IAsyncDisposable
{
    internal const string TenantId = "lockin";
    private const string GatewayOperationTag = "GatewayOperation";
    private static readonly TimeSpan NowWindow = TimeSpan.FromMinutes(1);
    private static readonly Regex GuidPattern = new("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", RegexOptions.Compiled);
    private static readonly Regex IsoDatePattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", RegexOptions.Compiled);

    internal static readonly JsonSerializerOptions Indented = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly IMongoDatabase _db;
    private readonly IMongoClient _client;
    private readonly LockInTenant _tenant;
    private readonly RecordingPublisher _publisher;
    private readonly ServiceProvider _services;
    private readonly IRequestExecutor _executor;
    private readonly HttpContextAccessor _httpContextAccessor;

    private GatewayLockInHarness(
        IMongoClient client, IMongoDatabase db, LockInTenant tenant, RecordingPublisher publisher,
        ServiceProvider services, IRequestExecutor executor, HttpContextAccessor httpContextAccessor)
    {
        _client = client;
        _db = db;
        _tenant = tenant;
        _publisher = publisher;
        _services = services;
        _executor = executor;
        _httpContextAccessor = httpContextAccessor;
    }

    public static async Task<GatewayLockInHarness> CreateAsync(MongoFixture fixture, LockInTenant tenant)
    {
        BlocksTestContext.Set(tenantId: TenantId);
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);

        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        var gqlRepository = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);

        // The drafts the schema is built from go in through the draft repository, as they do in production.
        var draftRepository = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        await draftRepository.InsertManyAsync(tenant.Schemas);
        if (tenant.Validations.Count > 0)
            await draftRepository.InsertManyAsync(tenant.Validations);
        if (tenant.Policies.Count > 0)
            await draftRepository.InsertManyAsync(tenant.Policies);

        foreach (var (collection, rows) in tenant.Seed)
            await db.GetCollection<BsonDocument>(collection).InsertManyAsync(rows);
        foreach (var (collection, field) in tenant.GeoIndexes)
            await db.GetCollection<BsonDocument>(collection).Indexes.CreateOneAsync(
                new CreateIndexModel<BsonDocument>(Builders<BsonDocument>.IndexKeys.Geo2DSphere(field), new CreateIndexOptions { Name = field + "_2dsphere" }));

        var publisher = new RecordingPublisher();
        var queryService = new QueryService(gqlRepository, Resolver(), Principals(), NullLogger<QueryService>.Instance);
        var mutationService = new MutationService(gqlRepository, publisher, Resolver(), Principals(), NullLogger<MutationService>.Instance);
        var schemaBuilder = new GraphqlSchemaBuilder(
            new SchemaResolver(mutationService, queryService), draftRepository, NullLogger<GraphqlSchemaBuilder>.Instance);

        var httpContextAccessor = new HttpContextAccessor();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHttpContextAccessor>(httpContextAccessor);
        services.AddGraphQLServer()
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)))
            // What tags the request-log summary onto the ambient activity in production.
            .AddDiagnosticEventListener<GatewayActivityDiagnosticEventListener>();
        var serviceProvider = services.BuildServiceProvider();
        var executor = await serviceProvider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();

        return new GatewayLockInHarness(fixture.Client, db, tenant, publisher, serviceProvider, executor, httpContextAccessor);
    }

    public IMongoCollection<BsonDocument> Collection(string name) => _db.GetCollection<BsonDocument>(name);

    public async Task<LockInResult> ExecuteAsync(string document, LockInCaller caller)
    {
        _publisher.Clear();
        ApplyCaller(caller);

        using var activity = new Activity("lockin").Start();
        var result = await _executor.ExecuteAsync(document);
        var responseJson = new JsonResultFormatter(new JsonResultFormatterOptions { Indented = false }).Format((IOperationResult)result);

        return new LockInResult(
            Serialise(Normalise(JsonNode.Parse(responseJson))),
            Serialise(await ReadMongoAsync()),
            Serialise(_publisher.ToJson()),
            Serialise(ReadOperationTags(activity)));
    }

    /// <summary>The request as the gateway sees it: the caller's token on the request context, and the tenant's x-blocks-key.</summary>
    private void ApplyCaller(LockInCaller caller)
    {
        // A request for the tenant itself (not the root tenant's Blocks Cloud console): the key matches the tenant being
        // served. With IsRequestFromBlocksCloud the Custom row rules deny everyone who is not impersonating.
        RequestContextAccessor.Current = new RequestContext { TenantId = TenantId, BlocksKey = TenantId, IsRequestFromBlocksCloud = false };
        SetContext(
            userId: caller.UserId ?? string.Empty,
            userName: caller.Authenticated ? $"{caller.UserId}@lockin.test" : string.Empty,
            tenantId: TenantId,
            isAuthenticated: caller.Authenticated,
            roles: caller.Roles);

        var http = new DefaultHttpContext();
        http.Request.Headers["x-blocks-key"] = TenantId;
        if (caller.Authenticated)
        {
            http.Request.Headers.Authorization = "Bearer lockin-test-token";
            http.User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(BlocksContext.TENANT_ID_CLAIM, TenantId),
                new Claim(BlocksContext.USER_ID_CLAIM, caller.UserId ?? string.Empty),
                .. caller.Roles.Select(role => new Claim(BlocksContext.ROLES_CLAIM, role)),
            ], "Bearer"));
        }

        _httpContextAccessor.HttpContext = http;
    }

    /// <summary>The "GatewayOperation" summary the request left on the activity, without its timings.</summary>
    private static JsonNode? ReadOperationTags(Activity activity)
    {
        var tag = activity.TagObjects.FirstOrDefault(t => t.Key == GatewayOperationTag).Value;
        if (tag is null)
            return null;

        var summary = JsonSerializer.SerializeToNode(tag)!.AsObject();
        foreach (var timing in summary.Select(p => p.Key).Where(IsTiming).ToList())
            summary.Remove(timing);
        return Normalise(summary);
    }

    private static bool IsTiming(string name) => name.EndsWith("Ms", StringComparison.Ordinal);

    /// <summary>Every data collection, rows ordered by _id, as relaxed extended JSON.</summary>
    private async Task<JsonNode?> ReadMongoAsync()
    {
        var state = new JsonObject();
        foreach (var name in _tenant.DataCollections)
        {
            var rows = await Collection(name).Find(FilterDefinition<BsonDocument>.Empty).ToListAsync();
            var array = new JsonArray();
            foreach (var row in rows.OrderBy(r => r["_id"].ToString(), StringComparer.Ordinal))
                array.Add(BsonToNode(row));
            state[name] = array;
        }
        return Normalise(state, sortKeys: true);
    }

    internal static JsonNode? BsonToNode(BsonDocument document) =>
        JsonNode.Parse(document.ToJson(new JsonWriterSettings { OutputMode = JsonOutputMode.RelaxedExtendedJson }));

    private static string Serialise(JsonNode? node) => node?.ToJsonString(Indented) ?? "null";

    /// <summary>
    /// Replaces what differs from run to run: server-generated ids, and times of "now". CreatedDate and
    /// LastUpdatedDate always read "&lt;now&gt;"; any other date within a minute of now does too.
    /// </summary>
    internal static JsonNode? Normalise(JsonNode? node, bool sortKeys = false)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj.Count == 1 && obj.ContainsKey("$oid"))
                    return JsonValue.Create("<generated-id>");
                if (obj.Count == 1 && obj.ContainsKey("$date"))
                    return NormaliseDate(obj["$date"]);

                var entries = obj.Select(p => (p.Key, Value: p.Value)).ToList();
                if (sortKeys)
                    entries = [.. entries.OrderBy(e => e.Key, StringComparer.Ordinal)];
                var normalised = new JsonObject();
                foreach (var (key, value) in entries)
                {
                    if (key is "CreatedDate" or "LastUpdatedDate")
                        normalised[key] = JsonValue.Create("<now>");
                    else
                        normalised[key] = Normalise(value?.DeepClone(), sortKeys);
                }
                return normalised;

            case JsonArray array:
                var items = new JsonArray();
                foreach (var item in array)
                    items.Add(Normalise(item?.DeepClone(), sortKeys));
                return items;

            case JsonValue value when value.TryGetValue<string>(out var text):
                return JsonValue.Create(NormaliseString(text));

            default:
                return node?.DeepClone();
        }
    }

    private static JsonNode? NormaliseDate(JsonNode? date)
    {
        var text = date?.ToString();
        if (text is not null && DateTime.TryParse(text, null, System.Globalization.DateTimeStyles.RoundtripKind, out var parsed)
            && (DateTime.UtcNow - parsed.ToUniversalTime()).Duration() <= NowWindow)
            return JsonValue.Create("<now>");
        return JsonValue.Create(text);
    }

    private static string NormaliseString(string text)
    {
        if (IsoDatePattern.IsMatch(text)
            && DateTime.TryParse(text, null, System.Globalization.DateTimeStyles.RoundtripKind, out var parsed)
            && (DateTime.UtcNow - parsed.ToUniversalTime()).Duration() <= NowWindow)
            return "<now>";
        return GuidPattern.Replace(text, "<generated-id>");
    }

    public async ValueTask DisposeAsync()
    {
        await _services.DisposeAsync();
        try { await _client.DropDatabaseAsync(_db.DatabaseNamespace.DatabaseName); }
        catch { /* best effort */ }
        ClearContext();
    }

    /// <summary>Records what the gateway would put on the message bus, in the order it was published.</summary>
    private sealed class RecordingPublisher : IDataChangeEventPublisher
    {
        private readonly List<JsonObject> _events = [];

        public void Clear() => _events.Clear();

        public Task PublishAsync(
            SchemaDefinitionExtended schema, DataChangeOperation operation,
            List<BsonDocument>? dataDocuments = null, List<UpdatedDocument>? updatedDocuments = null)
        {
            Record("Publish", schema, operation, dataDocuments, updatedDocuments);
            return Task.CompletedTask;
        }

        public Task PublishInChunksAsync(SchemaDefinitionExtended schema, DataChangeOperation operation, IReadOnlyList<BsonDocument> documents)
        {
            Record("PublishInChunks", schema, operation, [.. documents], null);
            return Task.CompletedTask;
        }

        private void Record(string kind, SchemaDefinitionExtended schema, DataChangeOperation operation, List<BsonDocument>? data, List<UpdatedDocument>? updated)
        {
            var entry = new JsonObject
            {
                ["Kind"] = kind,
                ["SchemaName"] = schema.SchemaName,
                ["CollectionName"] = schema.CollectionName,
                ["Operation"] = operation.ToString(),
                ["Data"] = data is null ? null : new JsonArray(data.Select(BsonToNode).ToArray()),
                ["UpdatedDocuments"] = updated is null ? null : JsonSerializer.SerializeToNode(updated),
            };
            _events.Add(entry);
        }

        public JsonNode? ToJson() => Normalise(new JsonArray(_events.Select(e => (JsonNode?)e.DeepClone()).ToArray()), sortKeys: true);
    }
}
