using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Resolvers;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds MongoDB mutation filters from a GraphQL resolver context, with optional RLS policy application.
/// Prioritizes typed where over legacy filter string. The argument-based overloads live in
/// <see cref="MutationFilterHelper"/>.
/// </summary>
public static class GraphQLMutationFilterHelper
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
        return useCustomAccess ? MutationFilterHelper.ApplyPolicyFilter(baseFilter, rlsResult) : baseFilter;
    }

    /// <summary>Builds base filter from context: prioritizes typed where over legacy filter string.</summary>
    public static BsonDocument BuildBaseFilter(IResolverContext context, SchemaDefinitionExtended schema)
    {
        var where = context.ArgumentValue<object?>(GraphQlConstant.WhereFieldName);
        if (where != null)
        {
            var converted = GraphQLArgumentNormalizer.ConvertWhere(where, schema);
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

    private static bool IsOwnerCheckRequested(IResolverContext context) =>
        context.ScopedContextData.TryGetValue(GraphQlConstant.CheckForOwnerContextKey, out var value) && value is true;
}
