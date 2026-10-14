using Blocks.DataAccess.Policies;
using Blocks.DataAccess.Models;
using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using Blocks.DataAccess.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using HotChocolate.Resolvers;
using Microsoft.Extensions.Logging;
using System.Linq;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Service for executing GraphQL queries against schema-backed collections with RLS/CLS support.
/// </summary>
public class QueryService : IQueryService
{
    private readonly IGqlDbRepository _repository;
    private readonly IDataAccessPolicyResolver _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger<QueryService> _logger;

    public QueryService(
        IGqlDbRepository repository,
        IDataAccessPolicyResolver resolver,
        IAccessPrincipalAccessor principals,
        ILogger<QueryService> logger)
    {
        _repository = repository;
        _resolver = resolver;
        _principals = principals;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<QueryResponse<Dictionary<string, object>>> GetDataAsync(
        IResolverContext ctx,
        SchemaDefinitionExtended schema)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(System.Diagnostics.Activity.Current);
        gatewayOperation.SchemaName = ctx.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        try
        {
            _logger.LogInformation("Getting data for schema {SchemaName}", schema.SchemaName);

            var queryInput = GetQueryInputFromContext(ctx);

            var request = new SchemaAccessRequest(_principals.Current, schema, PolicyOperation.READ);
            PolicyEvaluationResult rlsResult;
            BsonDocument mongoFilter;
            ReadProjection readProjection;
            using (GatewayOperationActivity.Measure(GatewayPhase.Policy))
            {
                rlsResult = _resolver.Check(request);
                EnsureReadAccess(rlsResult, schema);

                var userFilterBson = GetUserFilterBson(schema, queryInput.Where, queryInput.Filter);
                mongoFilter = _resolver.BuildReadFilter(request, userFilterBson, rlsResult);
                readProjection = _resolver.BuildReadProjection(request, ctx.MapQueryProjection());
            }
            var mongoProjection = readProjection.Projection;
            var mongoSort = GetMongoSort(schema, queryInput.Order, queryInput.Sort);
            var (skip, limit) = ComputePagination(queryInput.PageNo, queryInput.PageSize);

            gatewayOperation.CollectionName = schema.CollectionName;
            gatewayOperation.MongoQuery = new BsonDocument
            {
                { "filter", mongoFilter },
                { "projection", mongoProjection },
                { "sort", mongoSort ?? (BsonValue)BsonNull.Value }
            }.ToString();

            var (documents, totalCount) = await _repository.GetItemsWithCountAsync(
                schema.CollectionName,
                mongoFilter,
                mongoSort,
                mongoProjection,
                skip,
                limit);

            var items = documents
                .Select(doc => _resolver.MaskRow(request, doc.ToDictionary(), readProjection))
                .ToList();

            gatewayOperation.ResponseSize = documents.Sum(d => d.ToBson().Length);
            gatewayOperation.DocumentCount = documents.Count;

            _logger.LogInformation("Data retrieved for schema {SchemaName}", schema.SchemaName);

            return new QueryResponse<Dictionary<string, object>>
            {
                Items = items,
                TotalCount = (int)totalCount,
                PageNo = queryInput.PageNo ?? 1,
                PageSize = queryInput.PageSize ?? items.Count
            };
        }
        catch (GraphQLException ex)
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

    /// <summary>
    /// Reads <c>input</c> (<see cref="DynamicQueryInput"/>), optional <c>paging</c> (<see cref="PaginationInput"/>),
    /// and optional <c>where</c> / <c>order</c>. Per-field values in <c>paging</c> override pagination from <c>input</c>.
    /// </summary>
    private static QueryInputValues GetQueryInputFromContext(IResolverContext resolverContext)
    {
        var values = new QueryInputValues { Filter = "{}", Sort = "{}" };

        var input = resolverContext.ArgumentValue<DynamicQueryInput?>(GraphQlConstant.InputFieldName);
        if (input is not null)
        {
            if (!string.IsNullOrEmpty(input.Filter))
                values.Filter = input.Filter;
            if (!string.IsNullOrEmpty(input.Sort))
                values.Sort = input.Sort;
            if (input.PageNo.HasValue)
                values.PageNo = input.PageNo;
            if (input.PageSize.HasValue)
                values.PageSize = input.PageSize;
        }

        values.Where = resolverContext.ArgumentValue<object?>(GraphQlConstant.WhereFieldName);
        values.Order = resolverContext.ArgumentValue<object?>(GraphQlConstant.OrderFieldName);

        ApplyPagingArgument(values, resolverContext);

        return values;
    }

    private static void ApplyPagingArgument(QueryInputValues values, IResolverContext resolverContext)
    {
        var paging = resolverContext.ArgumentValue<PaginationInput?>(GraphQlConstant.PagingFieldName);
        if (paging is null)
            return;
        if (paging.PageNo.HasValue)
            values.PageNo = paging.PageNo;
        if (paging.PageSize.HasValue)
            values.PageSize = paging.PageSize;
    }

    /// <summary>Builds user filter BsonDocument: prioritizes typed where over legacy filter string.</summary>
    private static BsonDocument GetUserFilterBson(SchemaDefinitionExtended schema, object? where, string? filterJson)
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
                return doc.ReplaceSystemFieldInFilter();
            }
            catch { /* fall through to default */ }
        }
        return new BsonDocument();
    }

    /// <summary>Builds sort BsonDocument: prioritizes typed order over legacy sort string.</summary>
    private static BsonDocument? GetMongoSort(SchemaDefinitionExtended schema, object? order, string? sortJson)
    {
        if (order != null)
        {
            var converted = OrderToMongoSortConverter.Convert(order, schema);
            if (converted != null && converted.ElementCount > 0)
                return converted;
        }
        return ParseSortDocument(sortJson);
    }

    /// <summary>
    /// Evaluates RLS policies for the schema and operation through the resolver. When schema access is Custom and no RLS policy exists, access is denied.
    /// </summary>
    public PolicyEvaluationResult EvaluateRlsPolicies(SchemaDefinitionExtended schema, PolicyOperation operation) =>
        _resolver.Check(new SchemaAccessRequest(_principals.Current, schema, operation));

    /// <summary>Throws GraphQLException if RLS denies read access.</summary>
    private void EnsureReadAccess(PolicyEvaluationResult rlsResult, SchemaDefinitionExtended schema)
    {
        if (rlsResult.IsAccessGranted) return;

        _logger.LogWarning("Access denied for READ on schema {SchemaName}: {Error}", schema.SchemaName, rlsResult.ErrorMessage);
        var message = rlsResult.ErrorMessage ?? "You don't have permission to read records in this entity.";
        GatewayOperationActivity.MarkFailed(
            System.Diagnostics.Activity.Current,
            GatewayFailureKind.Authorization,
            message,
            GraphQlConstant.UnauthorizedErrorCode);

        throw new GraphQLException(
            ErrorBuilder.New()
                .SetMessage(message)
                .SetCode(GraphQlConstant.UnauthorizedErrorCode)
                .Build());
    }

    /// <summary>Computes skip/limit from page number and size.</summary>
    private static (int skip, int limit) ComputePagination(int? pageNo, int? pageSize)
    {
        const int defaultLimit = 10;
        if (pageNo is not null && pageSize is not null)
            return ((pageNo.Value - 1) * pageSize.Value, pageSize.Value);
        return (0, defaultLimit);
    }

    /// <summary>Parses sort JSON into BsonDocument or null.</summary>
    private static BsonDocument? ParseSortDocument(string? sortJson) =>
        string.IsNullOrEmpty(sortJson) ? null : BsonSerializer.Deserialize<BsonDocument>(sortJson);
}
