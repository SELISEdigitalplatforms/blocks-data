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
    /// The largest page a query may read. Unset (the default), pages are read as requested, as they
    /// always have been: no limit, and a <c>pageSize</c> of 0 reads every matching row. Set, a larger
    /// <c>pageSize</c> is clamped to it, a smaller one to at least 1, and <c>pageNo</c> to at least 1.
    /// Clients that page through everything with a large or zero page size get fewer rows once it is
    /// set, so turn it on only after checking they do not.
    /// </summary>
    public const string MaxPageSizeKey = "DataGateway:MaxPageSize";

    private readonly IGqlDbRepository _repository;
    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger _logger;
    private readonly int? _maxPageSize;
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
        _maxPageSize = maxPageSize is > 0 ? maxPageSize : null;
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
            var (skip, limit) = ComputePagination(command.PageNo, command.PageSize);

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
                PageNo = command.PageNo ?? 1,
                PageSize = _maxPageSize is null ? command.PageSize ?? items.Count : command.PageSize is null ? items.Count : limit
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

    /// <summary>Computes skip/limit from page number and size (see <see cref="MaxPageSizeKey"/>).</summary>
    private (int skip, int limit) ComputePagination(int? pageNo, int? pageSize)
    {
        const int defaultLimit = 10;
        if (pageNo is not null && pageSize is not null)
        {
            if (_maxPageSize is not { } maxPageSize)
                return ((pageNo.Value - 1) * pageSize.Value, pageSize.Value);

            var limit = Math.Clamp(pageSize.Value, 1, maxPageSize);
            return ((Math.Max(pageNo.Value, 1) - 1) * limit, limit);
        }
        return (0, defaultLimit);
    }

    /// <summary>Parses sort JSON into BsonDocument or null.</summary>
    private static BsonDocument? ParseSortDocument(string? sortJson) =>
        string.IsNullOrEmpty(sortJson) ? null : BsonSerializer.Deserialize<BsonDocument>(sortJson);
}
