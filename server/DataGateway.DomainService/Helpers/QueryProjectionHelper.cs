using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Projection helper. Its members forward to <see cref="ClsProjectionHelper"/>, which owns the CLS projection
/// logic, so existing callers keep compiling. The resolver-context overload lives in <c>GraphQLQueryProjectionHelper</c>.
/// </summary>
public static class QueryProjectionHelper
{
    public static bool PolicyCoversAnyRequestedField(DataAccessPolicy policy, HashSet<string> requestedFieldPaths) =>
        ClsProjectionHelper.PolicyCoversAnyRequestedField(policy, requestedFieldPaths);

    public static void EnsureProtectedFieldsInProjection(BsonDocument projection, string[] protectedFieldNames) =>
        ClsProjectionHelper.EnsureProtectedFieldsInProjection(projection, protectedFieldNames);

    public static void AddRuleOperandFieldsToProjection(
        PolicyRuleGroup ruleGroup,
        BsonDocument projection,
        HashSet<string> requestedFieldPaths,
        HashSet<string> evaluationOnlyFieldPaths) =>
        ClsProjectionHelper.AddRuleOperandFieldsToProjection(ruleGroup, projection, requestedFieldPaths, evaluationOnlyFieldPaths);

    public static void TryAddSchemaFieldToProjection(
        BsonDocument projection,
        HashSet<string> requestedFieldPaths,
        HashSet<string> evaluationOnlyFieldPaths,
        ConditionSource source,
        string fieldPath) =>
        ClsProjectionHelper.TryAddSchemaFieldToProjection(projection, requestedFieldPaths, evaluationOnlyFieldPaths, source, fieldPath);

    /// <summary>
    /// Builds the projection from an explicit list of requested fields, including protected fields and rule
    /// operand fields for CLS evaluation.
    /// </summary>
    public static BsonDocument BuildMongoProjectionWithCls(
        AccessPrincipal principal,
        IReadOnlyList<string>? requestedFields,
        SchemaDefinitionExtended schema,
        out HashSet<string> evaluationOnlyFieldPaths) =>
        ClsProjectionHelper.BuildMongoProjectionWithCls(principal, requestedFields, schema, out evaluationOnlyFieldPaths);
}
