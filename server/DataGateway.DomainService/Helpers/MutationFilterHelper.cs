using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Helpers;

public static class MutationFilterHelper
{
    public static BsonDocument BuildFilterWithRls(
        object? where,
        string? filterJson,
        bool isOwnerCheckRequested,
        SchemaDefinitionExtended schema,
        PolicyOperation operation,
        Func<SchemaDefinitionExtended, PolicyOperation, PolicyEvaluationResult> evaluateRlsPolicies)
    {
        var baseFilter = BuildBaseFilter(where, filterJson, isOwnerCheckRequested, schema);
        var rlsResult = evaluateRlsPolicies(schema, operation);
        var useCustomAccess = MutationInputHelper.GetSchemaAccessLevelForOperation(schema, operation) == SchemaAccessLevel.Custom;
        return useCustomAccess ? ApplyPolicyFilter(baseFilter, rlsResult) : baseFilter;
    }

    public static BsonDocument BuildBaseFilter(
        object? where,
        string? filterJson,
        bool isOwnerCheckRequested,
        SchemaDefinitionExtended schema)
    {
        if (where != null)
        {
            var converted = WhereToMongoFilterConverter.Convert(where, schema);
            if (converted != null && converted.ElementCount > 0)
            {
                var whereFilter = new BsonDocument(converted);
                if (isOwnerCheckRequested)
                    whereFilter.Add(nameof(GraphQlBaseEntity.CreatedBy), BlocksContext.GetContext()?.UserId ?? string.Empty);
                return whereFilter.ReplaceSystemFieldInFilter();
            }
        }

        var filterString = filterJson ?? "{}";
        var baseFilter = BsonSerializer.Deserialize<BsonDocument>(filterString) ?? new BsonDocument();
        if (isOwnerCheckRequested)
            baseFilter.Add(nameof(GraphQlBaseEntity.CreatedBy), BlocksContext.GetContext()?.UserId ?? string.Empty);
        return baseFilter.ReplaceSystemFieldInFilter();
    }

    public static BsonDocument ApplyPolicyFilter(BsonDocument baseFilter, PolicyEvaluationResult rlsResult)
    {
        if (!rlsResult.RequiresDataFilter || rlsResult.DataFilter.ElementCount == 0)
            return baseFilter;
        return new BsonDocument("$and", new BsonArray { baseFilter, rlsResult.DataFilter });
    }
}
