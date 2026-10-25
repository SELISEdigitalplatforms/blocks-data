using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using HotChocolate.Language;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// GraphQL-facing mutation input helper: parses the input from the resolver context. The path and CLS
/// members forward to <see cref="ClsInputHelper"/>, which owns that logic, so existing callers keep compiling.
/// </summary>
public static class MutationInputHelper
{
    public static List<string> GetAllPathsFromInput(IDictionary<string, object?> input, string prefix) =>
        ClsInputHelper.GetAllPathsFromInput(input, prefix);

    public static List<string> RemoveExcludedPathsFromInput(IDictionary<string, object?> input, List<string> excludedPaths) =>
        ClsInputHelper.RemoveExcludedPathsFromInput(input, excludedPaths);

    public static bool RemovePathFromInput(IDictionary<string, object?> item, string path) =>
        ClsInputHelper.RemovePathFromInput(item, path);

    public static string ToSchemaPath(string inputPath) =>
        ClsInputHelper.ToSchemaPath(inputPath);

    public static FieldDefinitionResponse? GetFieldDefForPath(SchemaDefinitionExtended schema, string path) =>
        ClsInputHelper.GetFieldDefForPath(schema, path);

    public static bool ShouldExcludeFieldByCls(AccessPrincipal principal, SchemaDefinitionExtended schema, PolicyOperation operation, string fieldPath, SchemaAccessLevel schemaAccessLevel) =>
        ClsInputHelper.ShouldExcludeFieldByCls(principal, schema, operation, fieldPath, schemaAccessLevel);

    public static SchemaAccessLevel GetSchemaAccessLevelForOperation(SchemaDefinitionExtended schema, PolicyOperation operation) =>
        ClsInputHelper.GetSchemaAccessLevelForOperation(schema, operation);

    public static PolicyEvaluationResult EvaluateClsPoliciesForInput(AccessPrincipal principal, SchemaDefinitionExtended schema, PolicyOperation operation, List<string> fieldPaths) =>
        ClsInputHelper.EvaluateClsPoliciesForInput(principal, schema, operation, fieldPaths);

    /// <summary>
    /// Ensures OrganizationId and Tags are non-null lists on insert.
    /// </summary>
    public static void EnsureDefaultListsForInsert(Dictionary<string, object?> input)
    {
        if (!input.ContainsKey(nameof(GraphQlBaseEntity.OrganizationId)) || input[nameof(GraphQlBaseEntity.OrganizationId)] is null)
            input[nameof(GraphQlBaseEntity.OrganizationId)] = string.Empty;
        if (!input.ContainsKey(nameof(GraphQlBaseEntity.Tags)) || input[nameof(GraphQlBaseEntity.Tags)] is null)
            input[nameof(GraphQlBaseEntity.Tags)] = new List<string>();
    }

    private static readonly string[] AccessListsWithRequester = [nameof(BaseEntity.Read), nameof(BaseEntity.Update), nameof(BaseEntity.Delete)];

    /// <summary>
    /// The requester can read, edit and delete what they create: on insert their user id is added to the row's
    /// Read, Update and Delete UserIds (kept once; ids already there stay). Nothing without a signed-in user.
    /// Only into a list the schema declares as the platform access list (that name, type OperationAccess): a
    /// schema without the property, or whose property of that name has another type, gets nothing, and such a
    /// property is a regular one, stored as sent.
    /// </summary>
    public static void AddRequesterToAccessLists(Dictionary<string, object?> input, SchemaDefinitionExtended schema)
    {
        var context = BlocksContext.GetContext();
        if (context is not { IsAuthenticated: true } || string.IsNullOrWhiteSpace(context.UserId))
            return;

        foreach (var name in AccessListsWithRequester)
        {
            if (!IsAccessList(schema, name))
                continue;

            var access = input.TryGetValue(name, out var value) && value is Dictionary<string, object?> sent ? sent : new Dictionary<string, object?>();
            var userIds = access.TryGetValue(nameof(OperationAccess.UserIds), out var ids) && ids is System.Collections.IEnumerable list && ids is not string
                ? list.Cast<object?>().ToList()
                : [];
            if (!userIds.Any(id => string.Equals(id?.ToString(), context.UserId, StringComparison.Ordinal)))
                userIds.Add(context.UserId);
            access[nameof(OperationAccess.UserIds)] = userIds;
            input[name] = access;
        }
    }

    private static bool IsAccessList(SchemaDefinitionExtended schema, string name) =>
        schema.Fields.Any(field => field.Name == name && field.Type == nameof(OperationAccess));

    /// <summary>Parses the mutation input from the resolver context.</summary>
    public static Dictionary<string, object?> ParseMutationInput(IResolverContext context, InputObjectType inputType)
    {
        var inputLiteral = context.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName) as ObjectValueNode;
        var input = new Dictionary<string, object?>();
        input.MapMutationInput(inputLiteral, inputType);
        return input;
    }

    /// <summary>Returns true if the request asks for hard delete.</summary>
    public static bool IsHardDeleteRequested(IResolverContext context, InputObjectType inputType)
    {
        var input = ParseMutationInput(context, inputType);
        return input.TryGetValue(GraphQlConstant.HardDeleteFieldName, out var value) && value is bool hardDelete && hardDelete;
    }

    /// <summary>Builds a standard "not found" action response for the given operation.</summary>
    public static ActionResponse ActionResponseNotFound(string operation) =>
        new ActionResponse { Acknowledged = false, Message = $"No data found to {operation} or you don't have permission to {operation} this record." };
}
