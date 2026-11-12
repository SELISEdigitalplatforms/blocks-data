using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Gateway;

/// <summary>
/// The gateway's data operations against MongoDB, with no transport in them. A transport adapter
/// (GraphQL's <c>QueryService</c> and <c>MutationService</c>) builds a command and calls in; failures come back
/// as <see cref="GatewayException"/>.
/// </summary>
public sealed partial class MongoGatewayDataEngine : IGatewayDataEngine
{
    /// <summary>
    /// The largest page a list query reads, for GraphQL and REST alike: <see cref="DefaultMaxPageSize"/> (1000)
    /// when unset, and also when set to 0 or below (logged once per engine). A <c>pageSize</c> of 0 or above the cap
    /// reads the cap; there is no unlimited value. REST checks its own <c>DataGateway:Rest:MaxPageSize</c> first and
    /// refuses page sizes outside it, so this cap only clamps REST pages when that limit is set higher.
    /// </summary>
    public const string MaxPageSizeKey = "DataGateway:MaxPageSize";

    /// <summary>The page-size cap used when <see cref="MaxPageSizeKey"/> is unset or not positive.</summary>
    public const int DefaultMaxPageSize = 1000;

    /// <summary>The page size read when a query sends none (or the cap, if that is smaller).</summary>
    public const int DefaultPageSize = 10;

    private readonly IGqlDbRepository _repository;
    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger _logger;
    private readonly int _maxPageSize;
    private readonly IDataChangeEventPublisher? _eventPublisher;
    private readonly IMutationNotifier? _notifier;
    private readonly IAfterWriteQueue? _afterWrite;

    public MongoGatewayDataEngine(
        IGqlDbRepository repository,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger logger,
        int? maxPageSize = null,
        IDataChangeEventPublisher? eventPublisher = null,
        IMutationNotifier? notifier = null,
        IAfterWriteQueue? afterWrite = null)
    {
        _repository = repository;
        _resolver = resolver;
        _principals = principals;
        _logger = logger;
        _maxPageSize = ResolveMaxPageSize(maxPageSize, logger);
        _eventPublisher = eventPublisher;
        _notifier = notifier;
        _afterWrite = afterWrite;
    }

    /// <inheritdoc />
    public async Task<QueryResponse<Dictionary<string, object>>> QueryAsync(EntityModel entity, QueryCommand command)
    {
        var schema = entity.Schema;
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(System.Diagnostics.Activity.Current);
        gatewayOperation.SchemaName = command.OperationName;
        gatewayOperation.EntityName = schema.SchemaName;

        try
        {
            _logger.LogInformation("Getting data for schema {SchemaName}", schema.SchemaName);

            var request = new SchemaAccessRequest(_principals.Current, schema, PolicyOperation.READ);
            PolicyEvaluationResult rlsResult;
            BsonDocument mongoFilter;
            ReadProjection readProjection;
            using (GatewayOperationActivity.Measure(GatewayPhase.Policy))
            {
                rlsResult = _resolver.Check(request);
                EnsureReadAccess(rlsResult, schema);

                var userFilterBson = GetUserFilterBson(schema, command.Where, command.LegacyFilterJson);
                mongoFilter = _resolver.BuildReadFilter(request, userFilterBson, rlsResult);
                readProjection = _resolver.BuildReadProjection(request, MapProjection(command.Select));
            }
            var mongoProjection = readProjection.Projection;
            var mongoSort = GetMongoSort(schema, command.Order, command.LegacySortJson);
            // After the access check, the filter and the sort, so their errors keep priority, and before the read,
            // so invalid paging makes no repository call.
            var (pageNo, skip, limit) = ComputePagination(schema, command.PageNo, command.PageSize);

            gatewayOperation.CollectionName = schema.CollectionName;
            gatewayOperation.MongoQuery = new BsonDocument
            {
                { "filter", mongoFilter },
                { "projection", mongoProjection },
                { "sort", mongoSort ?? (BsonValue)BsonNull.Value }
            }.ToString();

            var documents = await _repository.GetItemsAsync(
                schema.CollectionName,
                mongoFilter,
                mongoSort,
                mongoProjection,
                skip,
                limit);

            List<Dictionary<string, object>> items;
            using (GatewayOperationActivity.Measure(GatewayPhase.Policy))
            {
                items = documents
                    .Select(doc => _resolver.MaskRow(request, doc.ToDictionary(), readProjection))
                    .ToList();
            }

            gatewayOperation.ResponseSize = documents.Sum(BsonSize.Of);
            gatewayOperation.DocumentCount = documents.Count;

            _logger.LogInformation("Data retrieved for schema {SchemaName}", schema.SchemaName);

            var collectionName = schema.CollectionName;
            return new QueryResponse<Dictionary<string, object>>
            {
                Items = items,
                // Counted only if the response's totalCount/totalPages/hasNextPage is selected.
                TotalCountProvider = () => _repository.CountAsync(collectionName, mongoFilter),
                PageNo = pageNo,
                PageSize = limit
            };
        }
        catch (GatewayException ex)
        {
            _logger.LogError(ex, "GetDataAsync failed for schema {SchemaName} with GraphQLException", schema.SchemaName);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetDataAsync failed for schema {SchemaName} with Exception", schema.SchemaName);
            throw;
        }
    }

    // The mutation operations are in MongoGatewayDataEngine.Mutations.cs.

    /// <summary>The projection document the requested paths make: <c>{ path: 1 }</c> for each.</summary>
    private static BsonDocument MapProjection(IReadOnlyList<string> select)
    {
        var fields = new BsonDocument();
        foreach (var prop in select)
        {
            fields.Add(prop, 1);
        }

        return fields;
    }

    /// <summary>Builds user filter BsonDocument: prioritizes typed where over legacy filter string.</summary>
    private static BsonDocument GetUserFilterBson(SchemaDefinitionExtended schema, WhereNode? where, string? filterJson)
    {
        if (where != null)
        {
            var converted = WhereToMongoFilterConverter.Convert(where, schema);
            if (converted != null && converted.ElementCount > 0)
                return converted;
        }
        if (!string.IsNullOrWhiteSpace(filterJson) && filterJson != "{}")
        {
            try
            {
                var doc = BsonSerializer.Deserialize<BsonDocument>(filterJson) ?? new BsonDocument();
                return SystemFieldHelper.ReplaceSystemFieldInFilter(doc);
            }
            catch { /* fall through to default */ }
        }
        return new BsonDocument();
    }

    /// <summary>Builds sort BsonDocument: prioritizes typed order over legacy sort string.</summary>
    private static BsonDocument? GetMongoSort(SchemaDefinitionExtended schema, IReadOnlyList<OrderItem>? order, string? sortJson)
    {
        if (order != null)
        {
            var converted = OrderToMongoSortConverter.Convert(order, schema);
            if (converted != null && converted.ElementCount > 0)
                return converted;
        }
        return ParseSortDocument(sortJson);
    }

    /// <summary>Throws GatewayException if RLS denies read access.</summary>
    private void EnsureReadAccess(PolicyEvaluationResult rlsResult, SchemaDefinitionExtended schema)
    {
        if (rlsResult.IsAccessGranted) return;

        _logger.LogWarning("Access denied for READ on schema {SchemaName}: {Error}", schema.SchemaName, rlsResult.ErrorMessage);
        var message = rlsResult.ErrorMessage ?? "You don't have permission to read records in this entity.";
        GatewayOperationActivity.MarkFailed(
            System.Diagnostics.Activity.Current,
            GatewayFailureKind.Authorization,
            message,
            GraphQlConstant.ForbiddenErrorCode);

        throw new GatewayException(GraphQlConstant.ForbiddenErrorCode, message);
    }

    // The paging Warnings carry only these placeholders: no row, filter, sort, query text or user.
    private static readonly Action<ILogger, int, int, Exception?> LogInvalidMaxPageSize =
        LoggerMessage.Define<int, int>(
            LogLevel.Warning, new EventId(42301, "InvalidMaxPageSize"),
            "DataGateway:MaxPageSize {ConfiguredValue} is not a positive integer; using the default {DefaultMaxPageSize}");

    private static readonly Action<ILogger, string, string, int, int, Exception?> LogPageSizeClamped =
        LoggerMessage.Define<string, string, int, int>(
            LogLevel.Warning, new EventId(42302, "PageSizeClamped"),
            "Data Gateway page size clamped for tenant {TenantId}, schema {SchemaName}: requested {RequestedPageSize}, effective {EffectivePageSize}");

    /// <summary>The configured cap, or <see cref="DefaultMaxPageSize"/> (with one Warning) when it is not positive.</summary>
    private static int ResolveMaxPageSize(int? configured, ILogger logger)
    {
        if (configured is null)
            return DefaultMaxPageSize;
        if (configured > 0)
            return configured.Value;

        LogInvalidMaxPageSize(logger, configured.Value, DefaultMaxPageSize, null);
        return DefaultMaxPageSize;
    }

    /// <summary>
    /// Resolves the page to read: <c>pageNo</c> defaults to 1 and must be at least 1; <c>pageSize</c> defaults to
    /// <see cref="DefaultPageSize"/> (at most the cap), must not be negative, and 0 or anything above the cap reads the
    /// cap, so the limit is always between 1 and the cap. A size above the cap is logged with a Warning.
    /// </summary>
    private (int pageNo, int skip, int limit) ComputePagination(SchemaDefinitionExtended schema, int? pageNo, int? pageSize)
    {
        if (pageNo is < 1)
            ThrowPagingError("'pageNo' must be 1 or greater.");
        if (pageSize is < 0)
            ThrowPagingError("'pageSize' must be 0 or greater.");

        var effectivePageNo = pageNo ?? 1;
        int limit;
        if (pageSize is null)
        {
            limit = Math.Min(DefaultPageSize, _maxPageSize);
        }
        else if (pageSize == 0)
        {
            limit = _maxPageSize;
        }
        else if (pageSize > _maxPageSize)
        {
            limit = _maxPageSize;
            LogPageSizeClamped(_logger, TenantContext.GetTenantId(), schema.SchemaName, pageSize.Value, limit, null);
        }
        else
        {
            limit = pageSize.Value;
        }

        return (effectivePageNo, (effectivePageNo - 1) * limit, limit);
    }

    /// <summary>Marks the operation failed and throws the paging <c>VALIDATION_ERROR</c>, with no field errors.</summary>
    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private static void ThrowPagingError(string message)
    {
        GatewayOperationActivity.MarkFailed(
            System.Diagnostics.Activity.Current,
            GatewayFailureKind.Validation,
            message,
            GraphQlConstant.ValidationErrorErrorCode);

        throw new GatewayException(GraphQlConstant.ValidationErrorErrorCode, message);
    }

    /// <summary>Parses sort JSON into BsonDocument or null.</summary>
    private static BsonDocument? ParseSortDocument(string? sortJson) =>
        string.IsNullOrEmpty(sortJson) ? null : BsonSerializer.Deserialize<BsonDocument>(sortJson);
}
