using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Resolvers;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds MongoDB filters for mutations with optional RLS policy application.
/// Prioritizes typed where over legacy filter string.
/// </summary>
public static class MutationFilterHelper
{
    /// <summary>
    /// Builds the filter for a mutation, optionally combining with RLS data filter when schema uses custom access.
    /// Uses where when provided; otherwise falls back to legacy filter string.
    /// </summary>
    public static BsonDocument BuildFilterWithRls(
        IResolverContext context,
        SchemaDefinitionExtended schema,
        PolicyOperation operation,
        Func<SchemaDefinitionExtended, PolicyOperation, PolicyEvaluationResult> evaluateRlsPolicies)
    {
        var baseFilter = BuildBaseFilter(context, schema);
        var rlsResult = evaluateRlsPolicies(schema, operation);
        var useCustomAccess = MutationInputHelper.GetSchemaAccessLevelForOperation(schema, operation) == SchemaAccessLevel.Custom;
        return useCustomAccess ? ApplyPolicyFilter(baseFilter, rlsResult) : baseFilter;
    }

    /// <summary>Builds base filter from context: prioritizes typed where over legacy filter string.</summary>
    public static BsonDocument BuildBaseFilter(IResolverContext context, SchemaDefinitionExtended schema)
    {
        var where = context.ArgumentValue<object?>(GraphQlConstant.WhereFieldName);
        if (where != null)
        {
            var converted = WhereToMongoFilterConverter.Convert(where, schema);
            if (converted != null && converted.ElementCount > 0)
            {
                var whereFilter = new BsonDocument(converted);
                if (IsOwnerCheckRequested(context))
                    whereFilter.Add(nameof(GraphQlBaseEntity.CreatedBy), BlocksContext.GetContext()?.UserId ?? string.Empty);
                return whereFilter.ReplaceSystemFieldInFilter();
            }
        }

        var filterJson = context.ArgumentValue<string?>(GraphQlConstant.FilterFieldName) ?? "{}";
        var baseFilter = BsonSerializer.Deserialize<BsonDocument>(filterJson) ?? new BsonDocument();
        if (IsOwnerCheckRequested(context))
            baseFilter.Add(nameof(GraphQlBaseEntity.CreatedBy), BlocksContext.GetContext()?.UserId ?? string.Empty);
        return baseFilter.ReplaceSystemFieldInFilter();
    }

    /// <summary>Combines base filter with RLS data filter when required.</summary>
    public static BsonDocument ApplyPolicyFilter(BsonDocument baseFilter, PolicyEvaluationResult rlsResult)
    {
        if (!rlsResult.RequiresDataFilter || rlsResult.DataFilter.ElementCount == 0)
            return baseFilter;
        return new BsonDocument("$and", new BsonArray { baseFilter, rlsResult.DataFilter });
    }

    private static bool IsOwnerCheckRequested(IResolverContext context) =>
        context.ScopedContextData.TryGetValue(GraphQlConstant.CheckForOwnerContextKey, out var value) && value is true;
}
