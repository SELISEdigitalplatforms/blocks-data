using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds MongoDB filters for mutations with optional RLS policy application.
/// Prioritizes typed where over legacy filter string.
/// </summary>
public static class MutationFilterHelper
{
    /// <summary>Combines base filter with RLS data filter when required.</summary>
    public static BsonDocument ApplyPolicyFilter(BsonDocument baseFilter, PolicyEvaluationResult rlsResult) =>
        Blocks.Genesis.DataAccess.Evaluation.RlsFilterHelper.ApplyPolicyFilter(baseFilter, rlsResult);

    /// <summary>
    /// Builds the filter for a mutation from already-extracted arguments, combining it with the RLS data filter
    /// when the schema uses custom access. The resolver-context overloads live in <c>GraphQLMutationFilterHelper</c>.
    /// </summary>
    public static BsonDocument BuildFilterWithRls(
        IReadOnlyDictionary<string, object?>? where,
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

    /// <summary>Builds the base filter: prioritizes typed where over legacy filter string.</summary>
    public static BsonDocument BuildBaseFilter(
        IReadOnlyDictionary<string, object?>? where,
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
                return SystemFieldHelper.ReplaceSystemFieldInFilter(whereFilter);
            }
        }

        var filterString = filterJson ?? "{}";
        var baseFilter = BsonSerializer.Deserialize<BsonDocument>(filterString) ?? new BsonDocument();
        if (isOwnerCheckRequested)
            baseFilter.Add(nameof(GraphQlBaseEntity.CreatedBy), BlocksContext.GetContext()?.UserId ?? string.Empty);
        return SystemFieldHelper.ReplaceSystemFieldInFilter(baseFilter);
    }
}
