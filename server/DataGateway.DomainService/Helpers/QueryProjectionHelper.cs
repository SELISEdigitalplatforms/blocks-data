using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

public static class QueryProjectionHelper
{
    public static BsonDocument BuildMongoProjectionWithCls(
        IReadOnlyList<string>? requestedFields,
        SchemaDefinitionExtended schema,
        out HashSet<string> evaluationOnlyFieldPaths)
    {
        var projection = new BsonDocument();
        evaluationOnlyFieldPaths = new HashSet<string>();

        if (requestedFields is null || requestedFields.Count == 0)
        {
            foreach (var field in schema.Fields)
                projection[field.Name] = 1;
            projection[GraphQlConstant.DbEntityIdFieldName] = 1;
        }
        else
        {
            foreach (var field in requestedFields)
            {
                var projectionField = field == nameof(GraphQlBaseEntity.ItemId)
                    ? GraphQlConstant.DbEntityIdFieldName
                    : field;
                projection[projectionField] = 1;
            }
        }

        var requestedFieldPaths = projection.Names.ToHashSet();

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
