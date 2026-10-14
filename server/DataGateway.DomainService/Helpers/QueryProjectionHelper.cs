using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Models;
using Blocks.DataAccess.Policies;
using HotChocolate.Resolvers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// GraphQL-facing projection helper. Extracts the requested fields from the resolver context and hands
/// them to <see cref="ClsProjectionHelper"/>, which owns the CLS projection logic. The remaining members
/// forward to it so existing callers keep compiling.
/// </summary>
public static class QueryProjectionHelper
{
    /// <summary>
    /// Builds the MongoDB projection including protected fields and rule operand fields for CLS evaluation.
    /// </summary>
    public static BsonDocument BuildMongoProjectionWithCls(
        AccessPrincipal principal,
        IResolverContext resolverContext,
        SchemaDefinitionExtended schema,
        out HashSet<string> evaluationOnlyFieldPaths)
    {
        var projection = resolverContext.MapQueryProjection();
        return ClsProjectionHelper.ApplyReadClsPolicies(principal, projection, schema, out evaluationOnlyFieldPaths);
    }

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
    /// HotChocolate-free overload used by the REST gateway: builds the projection from an
    /// explicit list of requested fields instead of a resolver context.
    /// </summary>
    public static BsonDocument BuildMongoProjectionWithCls(
        AccessPrincipal principal,
        IReadOnlyList<string>? requestedFields,
        SchemaDefinitionExtended schema,
        out HashSet<string> evaluationOnlyFieldPaths) =>
        ClsProjectionHelper.BuildMongoProjectionWithCls(principal, requestedFields, schema, out evaluationOnlyFieldPaths);
}
