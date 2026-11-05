using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess;
using HotChocolate.Resolvers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// GraphQL-facing projection helper. Extracts the requested fields from the resolver context and hands
/// them to <see cref="ClsProjectionHelper"/>, which owns the CLS projection logic.
/// </summary>
public static class GraphQLQueryProjectionHelper
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
}
