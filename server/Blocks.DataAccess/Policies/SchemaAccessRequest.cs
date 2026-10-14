using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Models;
using MongoDB.Bson;

namespace Blocks.DataAccess.Policies;

/// <summary>One caller, one schema, one operation: the unit every resolver method decides on.</summary>
public sealed record SchemaAccessRequest(
    AccessPrincipal Principal,
    SchemaDefinitionExtended Schema,
    PolicyOperation Operation);

/// <summary>
/// The Mongo projection for a read plus what the row masking step needs afterwards: the paths that were
/// added only to evaluate rules (removed from the result) and the READ CLS policies to apply per row.
/// </summary>
public sealed record ReadProjection(
    BsonDocument Projection,
    HashSet<string> EvaluationOnlyFieldPaths,
    List<DataAccessPolicy> ClsReadPolicies);

/// <summary>Result of applying CLS to a mutation input: the paths that were excluded and those actually removed.</summary>
public sealed record InputRestriction(
    List<string> ExcludedFields,
    List<string> RemovedFieldNames);

/// <summary>
/// Outcome of resolving a filter in one call: the RLS gate result and, when access is granted, the
/// final Mongo filter. <see cref="Filter"/> is <c>null</c> when <see cref="IsAccessGranted"/> is false.
/// </summary>
public sealed record ResolvedFilter(
    PolicyEvaluationResult Evaluation,
    BsonDocument? Filter)
{
    public bool IsAccessGranted => Evaluation.IsAccessGranted;
}
