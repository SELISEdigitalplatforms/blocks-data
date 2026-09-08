using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Reads GraphQL request history from the trace store written by
/// <c>Blocks.Genesis.MongoDBTraceExporter</c>: a fixed "Traces" database, one collection per
/// tenant (named after the tenant id), holding one document per completed
/// <see cref="System.Diagnostics.Activity"/>. Only documents carrying the "GatewayOperation" tag
/// (<see cref="GatewayOperationActivity"/>) — i.e. GraphQL query/mutation requests — are returned.
/// </summary>
public class GraphLogHistoryService : IGraphLogHistoryService
{
    // MongoDBTraceExporter always writes here regardless of IBlocksSecret.TraceDatabaseName —
    // that secret exists but is unused by the exporter, so reading from it here would risk
    // pointing at the wrong database. "Traces" matches the exporter's own hardcoded constant.
    private const string TraceDatabaseName = "Traces";
    private const string GatewayOperationAttributePath = "Attributes.GatewayOperation";
    private const string UnknownSchemaName = "(unknown)";
    private const string FailedResponseStatus = "failed";
    private const string UnknownFailureKind = GatewayFailureKind.Unknown;
    private const string RequestSizeAttribute = "request.size.bytes";
    private const string ResponseSizeAttribute = "response.size.bytes";
    private const string SizesField = "Sizes";
    private const string StatusCodesField = "StatusCodes";
    private const string HttpResponseStatusCodeAttribute = "http.response.status_code";
    private const string ResponseStatusCodeAttribute = "response.status.code";
    private const string HistorySortValueField = "__historySortValue";

    /// <summary>
    /// Flattens each trace down to just the fields the in-memory aggregation reads — far cheaper
    /// than pulling whole trace documents (query text, headers, security context) to count them.
    ///
    /// It has to be an aggregation rather than a find projection: the payload-size attributes have
    /// dots *inside* their names ("request.size.bytes"), and dot notation cannot address those — a
    /// projection of "Attributes.request.size.bytes" looks for a nested request→size→bytes path and
    /// silently resolves to nothing. $objectToArray turns Attributes into k/v pairs so the keys can
    /// be matched literally.
    /// </summary>
    private static readonly BsonDocument AnalyticsProjection = new()
    {
        { "_id", 0 },
        { "Timestamp", 1 },
        { "Duration", 1 },
        { "SchemaName", $"${GatewayOperationAttributePath}.SchemaName" },
        { "ResponseStatus", $"${GatewayOperationAttributePath}.ResponseStatus" },
        { "FailureKind", $"${GatewayOperationAttributePath}.FailureKind" },
        { "FailureCode", $"${GatewayOperationAttributePath}.FailureCode" },
        { "DocumentCount", $"${GatewayOperationAttributePath}.DocumentCount" },
        { "InAppRequest", $"${GatewayOperationAttributePath}.InAppRequest" },
        { "EntityName", $"${GatewayOperationAttributePath}.EntityName" },
        { "OperationType", $"${GatewayOperationAttributePath}.OperationType" },
        { "PolicyMs", $"${GatewayOperationAttributePath}.PolicyMs" },
        { "ValidationMs", $"${GatewayOperationAttributePath}.ValidationMs" },
        { "DatabaseMs", $"${GatewayOperationAttributePath}.DatabaseMs" },
        { "PublishMs", $"${GatewayOperationAttributePath}.PublishMs" },
        {
            SizesField, new BsonDocument("$filter", new BsonDocument
            {
                { "input", new BsonDocument("$objectToArray", "$Attributes") },
                { "as", "attribute" },
                {
                    "cond", new BsonDocument("$in", new BsonArray
                    {
                        "$$attribute.k",
                        new BsonArray { RequestSizeAttribute, ResponseSizeAttribute },
                    })
                },
            })
        },
        {
            StatusCodesField, new BsonDocument("$filter", new BsonDocument
            {
                { "input", new BsonDocument("$objectToArray", "$Attributes") },
                { "as", "attribute" },
                {
                    "cond", new BsonDocument("$in", new BsonArray
                    {
                        "$$attribute.k",
                        new BsonArray
                        {
                            HttpResponseStatusCodeAttribute,
                            ResponseStatusCodeAttribute,
                        },
                    })
                },
            })
        },
    };

    // Safety cap on how many trace documents a single analytics request will pull into memory for
    // in-process aggregation. A UI-driven date range picker keeps normal usage well under this.
    private const int MaxAnalyticsDocuments = 20_000;

    // Enough rows to show where failures cluster without turning the card into a second log view.
    private const int MaxFailureHotspots = 10;
    private const int MaxDefinedSchemas = 500;
    private const string QueryOperationType = "query";

    /// <summary>
    /// Keeps schema introspection out of the analytics: it is tooling fetching the schema, not data
    /// access, and a single introspection response can outweigh a day of real traffic (76 KB against
    /// a few hundred bytes per query). The flag covers requests logged since it was introduced; the
    /// query-text match covers older traces. It looks for "__schema" specifically — the everyday
    /// "__typename" field must not be mistaken for introspection.
    /// </summary>
    private static readonly FilterDefinition<BsonDocument> NotIntrospection =
        Builders<BsonDocument>.Filter.Not(Builders<BsonDocument>.Filter.Or(
            Builders<BsonDocument>.Filter.Eq($"{GatewayOperationAttributePath}.IsIntrospection", true),
            Builders<BsonDocument>.Filter.Regex(
                $"{GatewayOperationAttributePath}.OperationQuery",
                new BsonRegularExpression("__schema"))));

    private readonly IDbContextProvider _dbContextProvider;
    private readonly IBlocksSecret _blocksSecret;

    public GraphLogHistoryService(IDbContextProvider dbContextProvider, IBlocksSecret blocksSecret)
    {
        _dbContextProvider = dbContextProvider;
        _blocksSecret = blocksSecret;
    }

    /// <inheritdoc />
    public async Task<PaginationResponse<GraphLogHistoryItemResponse>> GetHistoryAsync(GetGraphLogHistoryRequest request)
    {
        var collection = GetTenantTraceCollection();
        var filter = BuildFilter(request);
        var pageNo = request.PageNo < 1 ? 1 : request.PageNo;
        var pageSize = request.PageSize < 1 ? 10 : request.PageSize;
        var sortDirection = request.SortDescending ? -1 : 1;

        var totalCount = await collection.CountDocumentsAsync(filter);
        var documents = await collection
            .Aggregate()
            .Match(filter)
            .AppendStage<BsonDocument>(new BsonDocument("$set", new BsonDocument(
                HistorySortValueField, GetHistorySortExpression(request.SortBy))))
            .Sort(new BsonDocument
            {
                { HistorySortValueField, sortDirection },
                // Stable paging when several rows have the same displayed value.
                { "_id", sortDirection },
            })
            .Skip((pageNo - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync();

        var items = documents.Select(MapToResponse).ToList();
        return new PaginationResponse<GraphLogHistoryItemResponse>(totalCount, items);
    }

    /// <inheritdoc />
    public async Task<GraphLogAnalyticsResponse> GetAnalyticsAsync(GetGraphLogAnalyticsRequest request)
    {
        var collection = GetTenantTraceCollection();
        var bucketing = GraphLogBucketing.Parse(request.Granularity);

        var rangeEnd = request.To.HasValue ? ToRangeEndExclusive(request.To.Value) : DateTime.UtcNow;
        var from = request.From.HasValue
            ? ToUtc(request.From.Value)
            : bucketing.DefaultRangeStart(rangeEnd);
        // Last instant actually covered by the range — used for bucketing, where an exclusive end
        // would spill one empty bucket past the requested period.
        var to = rangeEnd.AddTicks(-1);

        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Exists(GatewayOperationAttributePath),
            Builders<BsonDocument>.Filter.Gte("Timestamp", from),
            Builders<BsonDocument>.Filter.Lt("Timestamp", rangeEnd),
            NotIntrospection);

        var documents = await collection
            .Aggregate()
            .Match(filter)
            .Limit(MaxAnalyticsDocuments)
            .Project<BsonDocument>(AnalyticsProjection)
            .ToListAsync();

        return new GraphLogAnalyticsResponse
        {
            RequestsOverTime = BuildRequestsOverTime(documents, from, to, bucketing),
            OperationStats = BuildOperationStats(documents),
            FailureStats = BuildFailureStats(documents),
            FailureHotspots = BuildFailureHotspots(documents),
            SchemaCoverage = BuildSchemaCoverage(documents, await GetDefinedEntityNamesAsync()),
            Timing = BuildTimingBreakdown(documents),
            Latency = BuildLatencySummary(documents),
            LatencyOverTime = BuildLatencyOverTime(documents, from, to, bucketing),
            Throughput = BuildThroughputSummary(documents),
            ThroughputOverTime = BuildThroughputOverTime(documents, from, to, bucketing),
        };
    }

    private IMongoCollection<BsonDocument> GetTenantTraceCollection()
    {
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
            throw new InvalidOperationException("Unable to resolve tenant for the current request.");

        var database = _dbContextProvider.GetDatabase(_blocksSecret.TraceConnectionString, TraceDatabaseName);
        return database.GetCollection<BsonDocument>(tenantId);
    }

    private static List<GraphLogRequestsOverTimeBucket> BuildRequestsOverTime(
        List<BsonDocument> documents, DateTime from, DateTime to, GraphLogBucketing bucketing)
    {
        var buckets = new Dictionary<DateTime, (int Success, int Denied, int Errored)>();
        foreach (var doc in documents)
        {
            var key = bucketing.KeyOf(GetDateTime(doc, "Timestamp"));
            var current = buckets.GetValueOrDefault(key);

            buckets[key] = !HasFailed(doc)
                ? (current.Success + 1, current.Denied, current.Errored)
                : GatewayFailureKind.IsDenial(EffectiveFailureKind(doc))
                    ? (current.Success, current.Denied + 1, current.Errored)
                    : (current.Success, current.Denied, current.Errored + 1);
        }

        return bucketing.Range(from, to)
            .Select(cursor =>
            {
                var stats = buckets.GetValueOrDefault(cursor);
                return new GraphLogRequestsOverTimeBucket
                {
                    Date = cursor,
                    Success = stats.Success,
                    Denied = stats.Denied,
                    Errored = stats.Errored,
                };
            })
            .ToList();
    }

    /// <summary>
    /// Response-time percentiles per bucket, on the same axis as the request counts, so a latency
    /// spike can be lined up against the traffic that caused it.
    /// </summary>
    private static List<GraphLogLatencyBucket> BuildLatencyOverTime(
        List<BsonDocument> documents, DateTime from, DateTime to, GraphLogBucketing bucketing)
    {
        var buckets = documents
            .GroupBy(doc => bucketing.KeyOf(GetDateTime(doc, "Timestamp")))
            .ToDictionary(group => group.Key, group => SortedDurations(group));

        return bucketing.Range(from, to)
            .Select(cursor =>
            {
                var durations = buckets.GetValueOrDefault(cursor) ?? [];
                return new GraphLogLatencyBucket
                {
                    Date = cursor,
                    P50 = Percentile(durations, 50),
                    P95 = Percentile(durations, 95),
                    P99 = Percentile(durations, 99),
                };
            })
            .ToList();
    }

    /// <summary>
    /// Bytes in and out per bucket. Sizes live on the span itself rather than in the
    /// GatewayOperation tag, so they are read straight off the Attributes document.
    /// </summary>
    private static List<GraphLogThroughputBucket> BuildThroughputOverTime(
        List<BsonDocument> documents, DateTime from, DateTime to, GraphLogBucketing bucketing)
    {
        var buckets = documents
            .GroupBy(doc => bucketing.KeyOf(GetDateTime(doc, "Timestamp")))
            .ToDictionary(
                group => group.Key,
                group => (
                    Request: group.Sum(doc => RequestSize(doc)),
                    Response: group.Sum(doc => ResponseSize(doc))));

        return bucketing.Range(from, to)
            .Select(cursor =>
            {
                var bytes = buckets.GetValueOrDefault(cursor);
                return new GraphLogThroughputBucket
                {
                    Date = cursor,
                    RequestBytes = bytes.Request,
                    ResponseBytes = bytes.Response,
                };
            })
            .ToList();
    }

    private static GraphLogThroughputSummary BuildThroughputSummary(List<BsonDocument> documents)
    {
        var requestBytes = documents.Sum(doc => RequestSize(doc));
        var responseBytes = documents.Sum(doc => ResponseSize(doc));

        return new GraphLogThroughputSummary
        {
            RequestBytes = requestBytes,
            ResponseBytes = responseBytes,
            TotalBytes = requestBytes + responseBytes,
        };
    }

    private static int DocumentCount(BsonDocument doc) => (int)GetInt64(doc, "DocumentCount");

    private static bool HasFailed(BsonDocument doc) =>
        GetString(doc, "ResponseStatus") == FailedResponseStatus;

    private static long RequestSize(BsonDocument doc) => SizeOf(doc, RequestSizeAttribute);

    private static long ResponseSize(BsonDocument doc) => SizeOf(doc, ResponseSizeAttribute);

    /// <summary>Reads one payload size out of the k/v pairs <see cref="AnalyticsProjection"/> extracts.</summary>
    private static long SizeOf(BsonDocument doc, string attribute)
    {
        if (!doc.TryGetValue(SizesField, out var value) || value is not BsonArray sizes)
            return 0;

        foreach (var entry in sizes.OfType<BsonDocument>())
        {
            if (GetString(entry, "k") == attribute && entry.TryGetValue("v", out var size) && size.IsNumeric)
                return size.ToInt64();
        }

        return 0;
    }

    private static GraphLogLatencySummary BuildLatencySummary(List<BsonDocument> documents)
    {
        var durations = SortedDurations(documents);
        if (durations.Count == 0)
            return new GraphLogLatencySummary();

        return new GraphLogLatencySummary
        {
            P50 = Percentile(durations, 50),
            P95 = Percentile(durations, 95),
            P99 = Percentile(durations, 99),
            Max = Math.Round(durations[^1], 2),
        };
    }

    private static List<double> SortedDurations(IEnumerable<BsonDocument> documents) =>
        documents.Select(doc => GetDouble(doc, "Duration")).Order().ToList();

    /// <summary>Nearest-rank percentile over an ascending list. Returns 0 for an empty list.</summary>
    private static double Percentile(List<double> sortedDurations, double percentile)
    {
        if (sortedDurations.Count == 0)
            return 0;

        var rank = (int)Math.Ceiling(percentile / 100 * sortedDurations.Count) - 1;
        return Math.Round(sortedDurations[Math.Clamp(rank, 0, sortedDurations.Count - 1)], 2);
    }

    private static List<GraphLogOperationStat> BuildOperationStats(List<BsonDocument> documents) =>
        documents
            .GroupBy(doc =>
            {
                var schemaName = GetString(doc, "SchemaName");
                return string.IsNullOrWhiteSpace(schemaName) ? UnknownSchemaName : schemaName;
            })
            .Select(group =>
            {
                var calls = group.Count();
                var failures = group.Where(HasFailed).ToList();
                var failed = failures.Count;
                var denied = failures.Count(doc => GatewayFailureKind.IsDenial(EffectiveFailureKind(doc)));
                var durations = SortedDurations(group);

                return new GraphLogOperationStat
                {
                    SchemaName = group.Key,
                    Calls = calls,
                    Success = calls - failed,
                    Failed = failed,
                    Denied = denied,
                    Errored = failed - denied,
                    ErrorRate = calls == 0 ? 0 : Math.Round((double)failed / calls * 100, 2),
                    AverageDuration = durations.Count == 0 ? 0 : Math.Round(durations.Average(), 2),
                    P95Duration = Percentile(durations, 95),
                    AverageResponseSize = calls == 0 ? 0 : Math.Round(group.Average(doc => (double)ResponseSize(doc)), 2),
                    MaxResponseSize = group.Max(doc => ResponseSize(doc)),
                    TotalBytes = group.Sum(doc => RequestSize(doc) + ResponseSize(doc)),
                    AverageDocumentCount = calls == 0 ? 0 : Math.Round(group.Average(DocumentCount), 2),
                    MaxDocumentCount = group.Max(DocumentCount),
                };
            })
            .OrderByDescending(stat => stat.Calls)
            .ToList();

    /// <summary>
    /// Failed requests grouped by why they failed. Older traces predate the failure classification,
    /// so a failure with no recorded kind counts as "unknown" rather than being dropped.
    /// </summary>
    private static List<GraphLogFailureStat> BuildFailureStats(List<BsonDocument> documents) =>
        documents
            .Where(HasFailed)
            .GroupBy(doc =>
            {
                return EffectiveFailureKind(doc);
            })
            .Select(group => new GraphLogFailureStat { FailureKind = group.Key, Count = group.Count() })
            .OrderByDescending(stat => stat.Count)
            .ToList();

    /// <summary>
    /// Failures cross-tabbed by schema and reason. Capped, because the useful answer is "which few
    /// places is this concentrated in" — a long tail of one-offs is noise on that question.
    /// </summary>
    private static List<GraphLogFailureHotspot> BuildFailureHotspots(List<BsonDocument> documents) =>
        documents
            .Where(HasFailed)
            .GroupBy(doc =>
            {
                var schemaName = GetString(doc, "SchemaName");
                return (
                    SchemaName: string.IsNullOrWhiteSpace(schemaName) ? UnknownSchemaName : schemaName,
                    FailureKind: EffectiveFailureKind(doc));
            })
            .Select(group => new GraphLogFailureHotspot
            {
                SchemaName = group.Key.SchemaName,
                FailureKind = group.Key.FailureKind,
                Count = group.Count(),
                ExternalCount = group.Count(doc => !GetBool(doc, "InAppRequest")),
            })
            .OrderByDescending(hotspot => hotspot.Count)
            .ThenBy(hotspot => hotspot.SchemaName, StringComparer.Ordinal)
            .Take(MaxFailureHotspots)
            .ToList();

    /// <summary>
    /// Mean time per phase. "Other" is what the measured phases leave over — clamped at zero,
    /// because a trace written before a phase was instrumented would otherwise make it negative.
    /// </summary>
    private static GraphLogTimingBreakdown BuildTimingBreakdown(List<BsonDocument> documents)
    {
        if (documents.Count == 0)
            return new GraphLogTimingBreakdown();

        double Mean(string field) => Math.Round(documents.Average(doc => GetDouble(doc, field)), 2);

        var total = Mean("Duration");
        var policy = Mean("PolicyMs");
        var validation = Mean("ValidationMs");
        var database = Mean("DatabaseMs");
        var publish = Mean("PublishMs");

        return new GraphLogTimingBreakdown
        {
            AverageTotal = total,
            AveragePolicy = policy,
            AverageValidation = validation,
            AverageDatabase = database,
            AveragePublish = publish,
            AverageOther = Math.Round(Math.Max(0, total - policy - validation - database - publish), 2),
        };
    }

    /// <summary>
    /// Traffic per entity schema, zero-filled across every schema the tenant has defined. The
    /// zero rows are the point: the trace store can only show what was called, so "never called"
    /// has to come from the schema definitions.
    /// </summary>
    private static List<GraphLogSchemaCoverage> BuildSchemaCoverage(
        List<BsonDocument> documents, List<string> definedEntityNames)
    {
        var traffic = documents
            .Where(doc => !string.IsNullOrWhiteSpace(GetString(doc, "EntityName")))
            .GroupBy(doc => GetString(doc, "EntityName"))
            .ToDictionary(
                group => group.Key,
                group => (
                    Queries: group.Count(doc => GetString(doc, "OperationType") == QueryOperationType),
                    Mutations: group.Count(doc => GetString(doc, "OperationType") != QueryOperationType)));

        // Schemas seen in traces but no longer defined (renamed or deleted) still belong in the
        // table — dropping them would quietly under-report the traffic.
        var entityNames = definedEntityNames.Union(traffic.Keys, StringComparer.Ordinal);

        return entityNames
            .Select(entityName =>
            {
                var counts = traffic.GetValueOrDefault(entityName);
                return new GraphLogSchemaCoverage
                {
                    EntityName = entityName,
                    Calls = counts.Queries + counts.Mutations,
                    Queries = counts.Queries,
                    Mutations = counts.Mutations,
                };
            })
            .OrderByDescending(coverage => coverage.Calls)
            .ThenBy(coverage => coverage.EntityName, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Entity schema names defined for the current tenant — DTOs are excluded because they are not
    /// callable, so they could never appear in the traffic this is compared against.
    /// </summary>
    private async Task<List<string>> GetDefinedEntityNamesAsync()
    {
        var filter = new BsonDocument
        {
            { nameof(SchemaDefinition.SchemaType), (int)SchemaType.Entity },
            { nameof(SchemaDefinition.IsDeleted), false },
        };
        var projection = Builders<BsonDocument>.Projection
            .Include(nameof(SchemaDefinition.SchemaName))
            .Exclude("_id");

        var schemas = await GetTenantSchemaCollection()
            .Find(filter)
            .Project(projection)
            .Limit(MaxDefinedSchemas)
            .ToListAsync();

        return schemas
            .Select(schema => GetString(schema, nameof(SchemaDefinition.SchemaName)))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// The current tenant's schema definitions. Resolved the same explicit way as the trace
    /// collection: a project's data lives in its own database, keyed by tenant id.
    /// </summary>
    private IMongoCollection<BsonDocument> GetTenantSchemaCollection()
    {
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
            throw new InvalidOperationException("Unable to resolve tenant for the current request.");

        // Matches DbRepository's own convention of pluralising the entity type name.
        return _dbContextProvider
            .GetDatabase(tenantId)
            .GetCollection<BsonDocument>($"{nameof(SchemaDefinition)}s");
    }

    private static FilterDefinition<BsonDocument> BuildFilter(GetGraphLogHistoryRequest request)
    {
        var builder = Builders<BsonDocument>.Filter;
        var filters = new List<FilterDefinition<BsonDocument>> { builder.Exists(GatewayOperationAttributePath) };

        if (!string.IsNullOrWhiteSpace(request.SchemaName))
            filters.Add(builder.Eq($"{GatewayOperationAttributePath}.SchemaName", request.SchemaName));

        if (!string.IsNullOrWhiteSpace(request.EntityName))
            filters.Add(builder.Eq($"{GatewayOperationAttributePath}.EntityName", request.EntityName));

        if (!string.IsNullOrWhiteSpace(request.OperationType))
            filters.Add(builder.Eq($"{GatewayOperationAttributePath}.OperationType", request.OperationType));

        if (!string.IsNullOrWhiteSpace(request.ResponseStatus))
            filters.Add(builder.Eq($"{GatewayOperationAttributePath}.ResponseStatus", request.ResponseStatus));

        if (!string.IsNullOrWhiteSpace(request.Outcome))
        {
            var responseStatusPath = $"{GatewayOperationAttributePath}.ResponseStatus";
            var denial = BuildDenialFilter(builder);
            filters.Add(request.Outcome.ToLowerInvariant() switch
            {
                "allowed" => builder.Eq(responseStatusPath, "success"),
                "denied" => builder.And(
                    builder.Eq(responseStatusPath, FailedResponseStatus), denial),
                "error" => builder.And(
                    builder.Eq(responseStatusPath, FailedResponseStatus), builder.Not(denial)),
                _ => builder.Empty,
            });
        }

        if (request.StatusCode.HasValue)
        {
            filters.Add(new BsonDocument("$expr", new BsonDocument("$eq", new BsonArray
            {
                GetStatusCodeExpression(),
                request.StatusCode.Value,
            })));
        }

        if (!string.IsNullOrWhiteSpace(request.FailureKind))
        {
            var failureKindPath = $"{GatewayOperationAttributePath}.FailureKind";
            var failureCodePath = $"{GatewayOperationAttributePath}.FailureCode";
            var hotChocolateCode = builder.Regex(failureCodePath, new BsonRegularExpression("^HC"));

            // Compatibility for traces written before HC document errors were correctly tagged.
            // It also makes the reason filter agree with the normalized value returned in each row.
            filters.Add(request.FailureKind switch
            {
                GatewayFailureKind.BadRequest => builder.Or(
                    builder.Eq(failureKindPath, GatewayFailureKind.BadRequest),
                    hotChocolateCode),
                GatewayFailureKind.Unhandled => builder.And(
                    builder.Eq(failureKindPath, GatewayFailureKind.Unhandled),
                    builder.Not(hotChocolateCode)),
                _ => builder.Eq(failureKindPath, request.FailureKind),
            });
        }

        if (request.From.HasValue)
            filters.Add(builder.Gte("Timestamp", ToUtc(request.From.Value)));

        if (request.To.HasValue)
            filters.Add(builder.Lt("Timestamp", ToRangeEndExclusive(request.To.Value)));

        return builder.And(filters);
    }

    private static FilterDefinition<BsonDocument> BuildDenialFilter(
        FilterDefinitionBuilder<BsonDocument> builder)
    {
        var failureKindPath = $"{GatewayOperationAttributePath}.FailureKind";
        var failureCodePath = $"{GatewayOperationAttributePath}.FailureCode";
        return builder.Or(
            builder.In(failureKindPath, new[]
            {
                GatewayFailureKind.Authentication,
                GatewayFailureKind.Authorization,
                GatewayFailureKind.Validation,
                GatewayFailureKind.BadRequest,
            }),
            builder.Regex(failureCodePath, new BsonRegularExpression("^HC")));
    }

    /// <summary>Allowlisted sort expressions for the columns exposed by request history.</summary>
    internal static BsonValue GetHistorySortExpression(string? sortBy) =>
        sortBy?.ToLowerInvariant() switch
        {
            "schema" => $"${GatewayOperationAttributePath}.SchemaName",
            "type" => $"${GatewayOperationAttributePath}.OperationType",
            "status" => GetOutcomeExpression(),
            "code" => GetStatusCodeExpression(),
            "duration" => "$Duration",
            "size" => GetLiteralAttributeExpression(ResponseSizeAttribute),
            "source" => $"${GatewayOperationAttributePath}.InAppRequest",
            _ => "$Timestamp",
        };

    private static BsonDocument GetOutcomeExpression()
    {
        var responseStatus = $"${GatewayOperationAttributePath}.ResponseStatus";
        var failureKind = $"${GatewayOperationAttributePath}.FailureKind";
        var failureCode = $"${GatewayOperationAttributePath}.FailureCode";
        var isDenied = new BsonDocument("$or", new BsonArray
        {
            new BsonDocument("$in", new BsonArray
            {
                failureKind,
                new BsonArray
                {
                    GatewayFailureKind.Authentication,
                    GatewayFailureKind.Authorization,
                    GatewayFailureKind.Validation,
                    GatewayFailureKind.BadRequest,
                },
            }),
            new BsonDocument("$regexMatch", new BsonDocument
            {
                { "input", new BsonDocument("$ifNull", new BsonArray { failureCode, string.Empty }) },
                { "regex", "^HC" },
            }),
        });

        return new BsonDocument("$switch", new BsonDocument
        {
            {
                "branches", new BsonArray
                {
                    new BsonDocument
                    {
                        { "case", new BsonDocument("$eq", new BsonArray { responseStatus, "success" }) },
                        { "then", "allowed" },
                    },
                    new BsonDocument
                    {
                        { "case", isDenied },
                        { "then", "denied" },
                    },
                }
            },
            { "default", "error" },
        });
    }

    private static BsonDocument GetStatusCodeExpression() => new("$ifNull", new BsonArray
    {
        GetLiteralAttributeExpression(HttpResponseStatusCodeAttribute),
        GetLiteralAttributeExpression(ResponseStatusCodeAttribute),
        0,
    });

    private static BsonDocument GetLiteralAttributeExpression(string field) => new("$getField", new BsonDocument
    {
        { "field", field },
        { "input", "$Attributes" },
    });

    /// <summary>
    /// Traces are stored as UTC instants, and the UI sends plain calendar dates, which model binding
    /// yields as <see cref="DateTimeKind.Unspecified"/>. Reading those as UTC keeps the range aligned
    /// with the stored timestamps instead of drifting by the server's local offset.
    /// </summary>
    private static DateTime ToUtc(DateTime value) =>
        value.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(value, DateTimeKind.Utc)
            : value.ToUniversalTime();

    /// <summary>
    /// Exclusive upper bound for a requested range. A date-only "To" binds to midnight, so comparing
    /// against it directly would drop everything that happened during that last day; expand it to the
    /// start of the following day instead.
    /// </summary>
    private static DateTime ToRangeEndExclusive(DateTime value)
    {
        var utc = ToUtc(value);
        return utc.TimeOfDay == TimeSpan.Zero ? utc.AddDays(1) : utc;
    }

    private static GraphLogHistoryItemResponse MapToResponse(BsonDocument doc)
    {
        var attributes = GetNestedDocument(doc, "Attributes");
        var gatewayOperation = GetNestedDocument(attributes, "GatewayOperation");
        var statusCode = GetStatusCode(attributes);

        return new GraphLogHistoryItemResponse
        {
            TraceId = GetString(doc, "TraceId"),
            Timestamp = GetDateTime(doc, "Timestamp"),
            StartTime = GetDateTime(doc, "StartTime"),
            EndTime = GetDateTime(doc, "EndTime"),
            Duration = GetDouble(doc, "Duration"),
            OperationName = GetString(doc, "OperationName"),
            StatusDescription = GetString(doc, "StatusDescription"),
            SchemaName = GetString(gatewayOperation, "SchemaName"),
            EntityName = GetString(gatewayOperation, "EntityName"),
            CollectionName = GetString(gatewayOperation, "CollectionName"),
            OperationType = GetString(gatewayOperation, "OperationType"),
            OperationQuery = GetString(gatewayOperation, "OperationQuery"),
            MongoQuery = GetString(gatewayOperation, "MongoQuery"),
            ResponseStatus = GetString(gatewayOperation, "ResponseStatus"),
            FailureKind = NormalizeFailureKind(
                GetString(gatewayOperation, "FailureKind"),
                GetString(gatewayOperation, "FailureCode"),
                statusCode),
            FailureCode = GetString(gatewayOperation, "FailureCode"),
            FailureMessage = GetString(gatewayOperation, "FailureMessage"),
            StatusCode = statusCode,
            // Payload sizes are span-level attributes written by the request pipeline, not part of
            // the GatewayOperation tag. Their keys contain dots, so they're read off the Attributes
            // document by key rather than as a nested path.
            RequestSize = GetInt64(attributes, "request.size.bytes"),
            ResponseSize = GetInt64(attributes, "response.size.bytes"),
            DatabaseResponseSize = GetInt64(gatewayOperation, "ResponseSize"),
            DocumentCount = (int)GetInt64(gatewayOperation, "DocumentCount"),
            UserAgent = GetString(attributes, "user_agent.original"),
            PolicyMs = GetDouble(gatewayOperation, "PolicyMs"),
            ValidationMs = GetDouble(gatewayOperation, "ValidationMs"),
            DatabaseMs = GetDouble(gatewayOperation, "DatabaseMs"),
            PublishMs = GetDouble(gatewayOperation, "PublishMs"),
            InAppRequest = GetBool(gatewayOperation, "InAppRequest"),
            IsIntrospection = GetBool(gatewayOperation, "IsIntrospection")
                || GetString(gatewayOperation, "OperationQuery").Contains("__schema", StringComparison.Ordinal),
        };
    }

    /// <summary>
    /// The reply's HTTP status code. Two attributes carry it — ASP.NET writes
    /// "http.response.status_code" and the gateway pipeline "response.status.code" — and a given
    /// span may only have one of them.
    /// </summary>
    private static int GetStatusCode(BsonDocument attributes)
    {
        var code = GetInt64(attributes, "http.response.status_code");
        if (code == 0)
            code = GetInt64(attributes, "response.status.code");

        return (int)code;
    }

    /// <summary>
    /// Returns the reader-facing reason. Besides enforcing that only a 5xx is a server error, this
    /// repairs already-stored HC document failures that older writers tagged as unhandled.
    /// </summary>
    internal static string NormalizeFailureKind(string failureKind, string failureCode, int statusCode)
    {
        if (failureCode.StartsWith("HC", StringComparison.Ordinal))
            return GatewayFailureKind.BadRequest;

        if (failureKind == GatewayFailureKind.Unhandled
            && !GatewayFailureKind.IsServerErrorStatus(statusCode))
            return UnknownFailureKind;

        return string.IsNullOrWhiteSpace(failureKind) ? UnknownFailureKind : failureKind;
    }

    /// <summary>Normalized reason for one flattened analytics projection.</summary>
    private static string EffectiveFailureKind(BsonDocument doc) => NormalizeFailureKind(
        GetString(doc, "FailureKind"),
        GetString(doc, "FailureCode"),
        GetProjectedStatusCode(doc));

    private static int GetProjectedStatusCode(BsonDocument doc)
    {
        if (!doc.TryGetValue(StatusCodesField, out var value) || value is not BsonArray statuses)
            return 0;

        var entries = statuses.OfType<BsonDocument>().ToList();
        var statusCode = GetProjectedAttribute(entries, HttpResponseStatusCodeAttribute);
        if (statusCode == 0)
            statusCode = GetProjectedAttribute(entries, ResponseStatusCodeAttribute);

        return (int)statusCode;
    }

    private static long GetProjectedAttribute(IEnumerable<BsonDocument> attributes, string key)
    {
        foreach (var attribute in attributes)
        {
            if (GetString(attribute, "k") == key
                && attribute.TryGetValue("v", out var value)
                && value.IsNumeric)
                return value.ToInt64();
        }

        return 0;
    }

    private static BsonDocument GetNestedDocument(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value is BsonDocument nested ? nested : new BsonDocument();

    private static string GetString(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsString ? value.AsString : string.Empty;

    private static DateTime GetDateTime(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsValidDateTime ? value.ToUniversalTime() : default;

    private static double GetDouble(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsNumeric ? value.ToDouble() : 0;

    private static long GetInt64(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsNumeric ? value.ToInt64() : 0;

    private static bool GetBool(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsBoolean && value.AsBoolean;
}
