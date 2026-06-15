using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class GatewayQueryService : IGatewayQueryService
{
    private readonly IGqlDbRepository _repository;
    private readonly ILogger<GatewayQueryService> _logger;

    public GatewayQueryService(IGqlDbRepository repository, ILogger<GatewayQueryService> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<QueryResponse<Dictionary<string, object>>> QueryAsync(
        GatewayQueryRequest request,
        SchemaDefinitionExtended schema)
    {
        _logger.LogInformation("Getting data for schema {SchemaName}", schema.SchemaName);

        var rlsResult = EvaluateRlsPolicies(schema, PolicyOperation.READ);
        EnsureReadAccess(rlsResult, schema);

        var userFilterBson = GetUserFilterBson(schema, request.Where, request.Filter);
        var mongoFilter = BuildMongoFilter(schema, userFilterBson, rlsResult);
        var mongoProjection = QueryProjectionHelper.BuildMongoProjectionWithCls(
            request.Fields, schema, out var evaluationOnlyFieldPaths);
        var mongoSort = GetMongoSort(schema, request.Order, request.Sort);
        var (skip, limit) = ComputePagination(request.Page, request.PerPage);

        var (documents, totalCount) = await _repository.GetItemsWithCountAsync(
            schema.CollectionName, mongoFilter, mongoSort, mongoProjection, skip, limit);

        var items = BuildResultItems(documents, schema, evaluationOnlyFieldPaths);

        _logger.LogInformation("Data retrieved for schema {SchemaName}", schema.SchemaName);

        return new QueryResponse<Dictionary<string, object>>
        {
            Items = items,
            TotalCount = (int)totalCount,
            PageNo = request.Page ?? 1,
            PageSize = request.PerPage ?? items.Count
        };
    }

    public async Task<Dictionary<string, object>?> GetByIdAsync(
        string id,
        List<string>? fields,
        SchemaDefinitionExtended schema)
    {
        _logger.LogInformation("Getting record {Id} for schema {SchemaName}", id, schema.SchemaName);

        var rlsResult = EvaluateRlsPolicies(schema, PolicyOperation.READ);
        EnsureReadAccess(rlsResult, schema);

        var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName, id);
        if (rlsResult.RequiresDataFilter && rlsResult.DataFilter.ElementCount > 0)
            filter = new BsonDocument("$and", new BsonArray { filter, rlsResult.DataFilter });

        var mongoProjection = QueryProjectionHelper.BuildMongoProjectionWithCls(
            fields, schema, out var evaluationOnlyFieldPaths);

        var documents = await _repository.GetItemsAsync(
            schema.CollectionName, filter, null, mongoProjection, 0, 1);

        if (documents is null || documents.Count == 0)
            return null;

        var items = BuildResultItems(documents, schema, evaluationOnlyFieldPaths);
        return items.FirstOrDefault();
    }

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
            catch { }
        }
        return new BsonDocument();
    }

    private static BsonDocument? GetMongoSort(SchemaDefinitionExtended schema, object? order, string? sortString)
    {
        if (order != null)
        {
            var converted = OrderToMongoSortConverter.Convert(order, schema);
            if (converted != null && converted.ElementCount > 0)
                return converted;
        }
        if (!string.IsNullOrWhiteSpace(sortString))
        {
            // Try PocketBase-style sort string first (e.g. "-created,name")
            if (sortString.Contains(',') || sortString.StartsWith('-') || sortString.StartsWith('+'))
            {
                var parsed = SortStringParser.Parse(sortString);
                if (parsed.Count > 0)
                {
                    var converted = OrderToMongoSortConverter.Convert(parsed, schema);
                    if (converted != null && converted.ElementCount > 0)
                        return converted;
                }
            }
            // Fall back to legacy JSON sort
            return ParseSortDocument(sortString);
        }
        return null;
    }

    private PolicyEvaluationResult EvaluateRlsPolicies(SchemaDefinitionExtended schema, PolicyOperation operation)
    {
        if (schema.ReadAccessLevel != SchemaAccessLevel.Custom || RequestContextAccessor.Current.IsRequestFromBlocksCloud)
            return new PolicyEvaluationResult { IsAccessGranted = true };

        var rlsPolicies = schema.Policies.Where(p => p.PolicyType == PolicyType.RLS).ToList();
        if (rlsPolicies.Count == 0)
            return new PolicyEvaluationResult { IsAccessGranted = false };

        return rlsPolicies.EvaluatePolicies(operation, PolicyType.RLS);
    }

    private void EnsureReadAccess(PolicyEvaluationResult rlsResult, SchemaDefinitionExtended schema)
    {
        if (rlsResult.IsAccessGranted) return;

        _logger.LogWarning("Access denied for READ on schema {SchemaName}: {Error}", schema.SchemaName, rlsResult.ErrorMessage);
        throw new AccessDeniedException(
            rlsResult.ErrorMessage ?? "You don't have permission to read records in this entity.");
    }

    private static BsonDocument BuildMongoFilter(
        SchemaDefinitionExtended schema,
        BsonDocument userFilterBson,
        PolicyEvaluationResult rlsResult)
    {
        var useCustomRls = schema.ReadAccessLevel == SchemaAccessLevel.Custom && !RequestContextAccessor.Current.IsRequestFromBlocksCloud;
        if (useCustomRls)
            return BuildFilterWithRlsPolicy(userFilterBson, rlsResult);

        if (userFilterBson.ElementCount == 0)
            return new BsonDocument();

        return new BsonDocument(userFilterBson).ReplaceSystemFieldInFilter();
    }

    private static BsonDocument BuildFilterWithRlsPolicy(BsonDocument userFilterBson, PolicyEvaluationResult rlsResult)
    {
        var rlsFilter = rlsResult.RequiresDataFilter ? rlsResult.DataFilter : new BsonDocument();

        if (userFilterBson.ElementCount == 0)
            return rlsFilter.ElementCount == 0 ? new BsonDocument() : rlsFilter;

        var userFilter = new BsonDocument(userFilterBson);
        userFilter.ReplaceSystemFieldInFilter();
        if (rlsFilter.ElementCount > 0)
            userFilter = new BsonDocument("$and", new BsonArray { userFilter, rlsFilter });
        return userFilter;
    }

    private static (int skip, int limit) ComputePagination(int? page, int? perPage)
    {
        const int defaultLimit = 10;
        if (page is not null && perPage is not null)
            return ((page.Value - 1) * perPage.Value, perPage.Value);
        if (perPage is not null)
            return (0, perPage.Value);
        return (0, defaultLimit);
    }

    private static BsonDocument? ParseSortDocument(string? sortJson) =>
        string.IsNullOrEmpty(sortJson) ? null : BsonSerializer.Deserialize<BsonDocument>(sortJson);

    private static List<Dictionary<string, object>> BuildResultItems(
        List<BsonDocument> documents,
        SchemaDefinitionExtended schema,
        HashSet<string> evaluationOnlyFieldPaths)
    {
        if (RequestContextAccessor.Current.IsRequestFromBlocksCloud)
            return documents.Select(doc => doc.ToDictionary()).ToList();

        var clsPoliciesForRow = schema.Policies
            .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
            .ToList();
        return documents
            .Select(doc => QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                doc.ToDictionary(),
                schema,
                clsPoliciesForRow,
                evaluationOnlyFieldPaths,
                QueryPolicyRuleEvaluator.RowSatisfiesPolicy))
            .ToList();
    }
}
