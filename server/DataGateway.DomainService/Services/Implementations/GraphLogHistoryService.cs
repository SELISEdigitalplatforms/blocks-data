using Blocks.Genesis;
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

    // Safety cap on how many trace documents a single analytics request will pull into memory for
    // in-process aggregation. A UI-driven date range picker keeps normal usage well under this.
    private const int MaxAnalyticsDocuments = 20_000;

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
        var sort = request.SortDescending
            ? Builders<BsonDocument>.Sort.Descending(request.SortBy)
            : Builders<BsonDocument>.Sort.Ascending(request.SortBy);

        var pageNo = request.PageNo < 1 ? 1 : request.PageNo;
        var pageSize = request.PageSize < 1 ? 10 : request.PageSize;

        var totalCount = await collection.CountDocumentsAsync(filter);
        var documents = await collection
            .Find(filter)
            .Sort(sort)
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
        var isWeekly = string.Equals(request.Granularity, "weekly", StringComparison.OrdinalIgnoreCase);

        var rangeEnd = request.To.HasValue ? ToRangeEndExclusive(request.To.Value) : DateTime.UtcNow;
        var from = request.From.HasValue
            ? ToUtc(request.From.Value)
            : rangeEnd.Date.AddDays(isWeekly ? -7 * 8 : -7);
        // Last instant actually covered by the range — used for bucketing, where an exclusive end
        // would spill one empty bucket past the requested period.
        var to = rangeEnd.AddTicks(-1);

        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Exists(GatewayOperationAttributePath),
            Builders<BsonDocument>.Filter.Gte("Timestamp", from),
            Builders<BsonDocument>.Filter.Lt("Timestamp", rangeEnd));

        // Only the fields the aggregation below actually needs — much cheaper than pulling every
        // full trace document (query text, mongo filter, etc.) just to count and bucket them.
        var projection = Builders<BsonDocument>.Projection
            .Include("Timestamp")
            .Include($"{GatewayOperationAttributePath}.SchemaName")
            .Include($"{GatewayOperationAttributePath}.ResponseStatus")
            .Include($"{GatewayOperationAttributePath}.FailureKind");

        var documents = await collection
            .Find(filter)
            .Project(projection)
            .Limit(MaxAnalyticsDocuments)
            .ToListAsync();

        return new GraphLogAnalyticsResponse
        {
            RequestsOverTime = BuildRequestsOverTime(documents, from, to, isWeekly),
            OperationStats = BuildOperationStats(documents),
            FailureStats = BuildFailureStats(documents),
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
        List<BsonDocument> documents, DateTime from, DateTime to, bool isWeekly)
    {
        DateTime BucketKey(DateTime timestamp) => isWeekly ? StartOfWeek(timestamp.Date) : timestamp.Date;

        var buckets = new Dictionary<DateTime, (int Success, int Failed)>();
        foreach (var doc in documents)
        {
            var gatewayOperation = GetNestedDocument(GetNestedDocument(doc, "Attributes"), "GatewayOperation");
            var failed = GetString(gatewayOperation, "ResponseStatus") == FailedResponseStatus;
            var key = BucketKey(GetDateTime(doc, "Timestamp"));

            var current = buckets.GetValueOrDefault(key);
            buckets[key] = failed ? (current.Success, current.Failed + 1) : (current.Success + 1, current.Failed);
        }

        // Zero-fill every bucket across the range so the chart has a continuous, evenly-spaced axis.
        var result = new List<GraphLogRequestsOverTimeBucket>();
        var step = isWeekly ? TimeSpan.FromDays(7) : TimeSpan.FromDays(1);
        var cursor = BucketKey(from);
        var end = BucketKey(to);
        while (cursor <= end)
        {
            var stats = buckets.GetValueOrDefault(cursor);
            result.Add(new GraphLogRequestsOverTimeBucket { Date = cursor, Success = stats.Success, Failed = stats.Failed });
            cursor = cursor.Add(step);
        }
        return result;
    }

    private static DateTime StartOfWeek(DateTime date)
    {
        var daysSinceMonday = ((int)date.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
        return date.AddDays(-daysSinceMonday);
    }

    private static List<GraphLogOperationStat> BuildOperationStats(List<BsonDocument> documents) =>
        documents
            .Select(doc => GetNestedDocument(GetNestedDocument(doc, "Attributes"), "GatewayOperation"))
            .GroupBy(gatewayOperation =>
            {
                var schemaName = GetString(gatewayOperation, "SchemaName");
                return string.IsNullOrWhiteSpace(schemaName) ? UnknownSchemaName : schemaName;
            })
            .Select(group =>
            {
                var calls = group.Count();
                var failed = group.Count(go => GetString(go, "ResponseStatus") == FailedResponseStatus);
                return new GraphLogOperationStat
                {
                    SchemaName = group.Key,
                    Calls = calls,
                    Success = calls - failed,
                    Failed = failed,
                    ErrorRate = calls == 0 ? 0 : Math.Round((double)failed / calls * 100, 2),
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
            .Select(doc => GetNestedDocument(GetNestedDocument(doc, "Attributes"), "GatewayOperation"))
            .Where(gatewayOperation => GetString(gatewayOperation, "ResponseStatus") == FailedResponseStatus)
            .GroupBy(gatewayOperation =>
            {
                var failureKind = GetString(gatewayOperation, "FailureKind");
                return string.IsNullOrWhiteSpace(failureKind) ? UnknownFailureKind : failureKind;
            })
            .Select(group => new GraphLogFailureStat { FailureKind = group.Key, Count = group.Count() })
            .OrderByDescending(stat => stat.Count)
            .ToList();

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

        if (!string.IsNullOrWhiteSpace(request.FailureKind))
            filters.Add(builder.Eq($"{GatewayOperationAttributePath}.FailureKind", request.FailureKind));

        if (request.From.HasValue)
            filters.Add(builder.Gte("Timestamp", ToUtc(request.From.Value)));

        if (request.To.HasValue)
            filters.Add(builder.Lt("Timestamp", ToRangeEndExclusive(request.To.Value)));

        return builder.And(filters);
    }

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

        return new GraphLogHistoryItemResponse
        {
            TraceId = GetString(doc, "TraceId"),
            Timestamp = GetDateTime(doc, "Timestamp"),
            StartTime = GetDateTime(doc, "StartTime"),
            EndTime = GetDateTime(doc, "EndTime"),
            Duration = GetDouble(doc, "Duration"),
            OperationName = GetString(doc, "OperationName"),
            Status = GetString(doc, "Status"),
            StatusDescription = GetString(doc, "StatusDescription"),
            SchemaName = GetString(gatewayOperation, "SchemaName"),
            EntityName = GetString(gatewayOperation, "EntityName"),
            CollectionName = GetString(gatewayOperation, "CollectionName"),
            OperationType = GetString(gatewayOperation, "OperationType"),
            OperationQuery = GetString(gatewayOperation, "OperationQuery"),
            MongoQuery = GetString(gatewayOperation, "MongoQuery"),
            ResponseStatus = GetString(gatewayOperation, "ResponseStatus"),
            FailureKind = GetString(gatewayOperation, "FailureKind"),
            FailureCode = GetString(gatewayOperation, "FailureCode"),
            FailureMessage = GetString(gatewayOperation, "FailureMessage"),
            StatusCode = GetStatusCode(attributes),
            // Payload sizes are span-level attributes written by the request pipeline, not part of
            // the GatewayOperation tag. Their keys contain dots, so they're read off the Attributes
            // document by key rather than as a nested path.
            RequestSize = GetInt64(attributes, "request.size.bytes"),
            ResponseSize = GetInt64(attributes, "response.size.bytes"),
            DatabaseResponseSize = GetInt64(gatewayOperation, "ResponseSize"),
            InAppRequest = GetBool(gatewayOperation, "InAppRequest"),
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
