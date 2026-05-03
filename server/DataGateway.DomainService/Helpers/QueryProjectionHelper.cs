using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Resolvers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds MongoDB projection documents for queries, including CLS-protected and rule-operand fields.
/// </summary>
public static class QueryProjectionHelper
{
    /// <summary>
    /// Builds the MongoDB projection including protected fields and rule operand fields for CLS evaluation.
    /// </summary>
    public static BsonDocument BuildMongoProjectionWithCls(
        IResolverContext resolverContext,
        SchemaDefinitionExtended schema,
        out HashSet<string> evaluationOnlyFieldPaths)
    {
        var projection = resolverContext.MapQueryProjection();
        var requestedFieldPaths = projection.Names.ToHashSet();
        evaluationOnlyFieldPaths = new HashSet<string>();

        if (RequestContextAccessor.Current.IsRequestFromBlocksCloud)
            return projection;

        var readClsPolicies = schema.Policies
            .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
            .ToList();
        var policiesRelevantToProjection = readClsPolicies
            .Where(policy => PolicyCoversAnyRequestedField(policy, requestedFieldPaths))
            .ToList();

        foreach (var policy in policiesRelevantToProjection)
        {
            EnsureProtectedFieldsInProjection(projection, policy.FieldNames);
            if (policy.RuleGroup != null)
                AddRuleOperandFieldsToProjection(policy.RuleGroup, projection, requestedFieldPaths, evaluationOnlyFieldPaths);
        }

        return projection;
    }

    /// <summary>
    /// Returns true if the policy covers at least one requested field path.
    /// </summary>
    public static bool PolicyCoversAnyRequestedField(DataAccessPolicy policy, HashSet<string> requestedFieldPaths)
    {
        foreach (var fieldName in policy.FieldNames)
        {
            if (string.IsNullOrEmpty(fieldName)) continue;
            if (requestedFieldPaths.Contains(fieldName)) return true;
            if (requestedFieldPaths.Any(path => path.StartsWith(fieldName + ".", StringComparison.Ordinal))) return true;
        }
        return false;
    }

    /// <summary>
    /// Adds protected fields to the projection, avoiding path collision with existing child paths.
    /// </summary>
    public static void EnsureProtectedFieldsInProjection(BsonDocument projection, string[] protectedFieldNames)
    {
        var projectionKeys = projection.Names.ToHashSet();
        foreach (var fieldName in protectedFieldNames)
        {
            if (projection.Contains(fieldName))
                continue;
            if (projectionKeys.Any(key => key.StartsWith(fieldName + ".", StringComparison.Ordinal)))
                continue;
            projection[fieldName] = 1;
        }
    }

    /// <summary>
    /// Adds schema fields used in policy rules to the projection (and marks evaluation-only paths).
    /// </summary>
    public static void AddRuleOperandFieldsToProjection(
        PolicyRuleGroup ruleGroup,
        BsonDocument projection,
        HashSet<string> requestedFieldPaths,
        HashSet<string> evaluationOnlyFieldPaths)
    {
        foreach (var rule in ruleGroup.Rules)
        {
            TryAddSchemaFieldToProjection(projection, requestedFieldPaths, evaluationOnlyFieldPaths, rule.LeftSource, rule.LeftOperand);
            TryAddSchemaFieldToProjection(projection, requestedFieldPaths, evaluationOnlyFieldPaths, rule.RightSource, rule.RightOperand);
        }
        foreach (var nestedGroup in ruleGroup.NestedGroups)
            AddRuleOperandFieldsToProjection(nestedGroup, projection, requestedFieldPaths, evaluationOnlyFieldPaths);
    }

    /// <summary>
    /// Adds a schema field to projection if it's a SCHEMA_FIELD operand; marks as evaluation-only if not requested.
    /// </summary>
    public static void TryAddSchemaFieldToProjection(
        BsonDocument projection,
        HashSet<string> requestedFieldPaths,
        HashSet<string> evaluationOnlyFieldPaths,
        ConditionSource source,
        string fieldPath)
    {
        if (source != ConditionSource.SCHEMA_FIELD || string.IsNullOrEmpty(fieldPath)) return;
        if (projection.Contains(fieldPath)) return;

        projection[fieldPath] = 1;
        if (!requestedFieldPaths.Contains(fieldPath))
            evaluationOnlyFieldPaths.Add(fieldPath);
    }
}
