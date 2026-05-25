using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using HotChocolate.Language;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Helpers for mutation input: path collection, path removal, and CLS field resolution.
/// </summary>
public static class MutationInputHelper
{
    /// <summary>
    /// Collects all field paths from input (root and nested).
    /// E.g. {"ContactInfo": {"Email": "x"}} -> ["ContactInfo", "ContactInfo.Email"].
    /// </summary>
    public static List<string> GetAllPathsFromInput(IDictionary<string, object?> input, string prefix)
    {
        var paths = new List<string>();
        foreach (var kv in input)
        {
            var path = string.IsNullOrEmpty(prefix) ? kv.Key : prefix + "." + kv.Key;
            paths.Add(path);
            var value = kv.Value;
            if (value is IDictionary<string, object?> nested)
                paths.AddRange(GetAllPathsFromInput(nested, path));
            else if (value is IList<object?> list)
            {
                for (var i = 0; i < list.Count; i++)
                {
                    var itemPath = path + "." + i;
                    paths.Add(itemPath);
                    var item = list[i];
                    if (item is IDictionary<string, object?> itemDict)
                        paths.AddRange(GetAllPathsFromInput(itemDict, itemPath));
                }
            }
        }
        return paths;
    }

    /// <summary>
    /// Removes excluded paths from input and returns the list of removed path names.
    /// </summary>
    public static List<string> RemoveExcludedPathsFromInput(IDictionary<string, object?> input, List<string> excludedPaths)
    {
        var removed = new List<string>();
        foreach (var path in excludedPaths)
        {
            if (RemovePathFromInput(input, path))
                removed.Add(path);
        }
        return removed;
    }

    /// <summary>
    /// Removes or nulls a path from input. Returns true if the path was present and removed.
    /// </summary>
    public static bool RemovePathFromInput(IDictionary<string, object?> item, string path)
    {
        var dotIndex = path.IndexOf('.');
        if (dotIndex < 0)
        {
            if (item.ContainsKey(path))
            {
                item.Remove(path);
                return true;
            }
            return false;
        }
        var segment = path[..dotIndex];
        var rest = path[(dotIndex + 1)..];
        if (!item.TryGetValue(segment, out var segmentValue) || segmentValue == null)
            return false;
        if (segmentValue is IDictionary<string, object?> nested)
            return RemovePathFromInput(nested, rest);
        if (segmentValue is IList<object?> list)
        {
            var restDot = rest.IndexOf('.');
            if (restDot < 0)
            {
                if (int.TryParse(rest, out var index) && index >= 0 && index < list.Count)
                {
                    list[index] = null;
                    return true;
                }
                return false;
            }
            var indexStr = rest[..restDot];
            var innerPath = rest[(restDot + 1)..];
            if (int.TryParse(indexStr, out var arrayIndex) && arrayIndex >= 0 && arrayIndex < list.Count && list[arrayIndex] is IDictionary<string, object?> innerDict)
                return RemovePathFromInput(innerDict, innerPath);
        }
        return false;
    }

    /// <summary>
    /// Converts an input path (may contain array indices, e.g. "Courses.0.Description") to a schema path (e.g. "Courses.Description").
    /// </summary>
    public static string ToSchemaPath(string inputPath)
    {
        if (string.IsNullOrEmpty(inputPath)) return inputPath;
        var segments = inputPath.Split('.');
        var schemaSegments = segments.Where(s => !string.IsNullOrEmpty(s) && !int.TryParse(s, out _)).ToArray();
        return string.Join(".", schemaSegments);
    }

    /// <summary>
    /// Resolves field definition for a path (root or nested), max 5 levels.
    /// Path may contain array indices (e.g. "Courses.0.Description"); they are skipped when resolving against schema.
    /// </summary>
    public static FieldDefinitionResponse? GetFieldDefForPath(SchemaDefinitionExtended schema, string path)
    {
        if (string.IsNullOrEmpty(path) || path == GraphQlConstant.DbEntityIdFieldName)
            return null;

        var schemaPath = ToSchemaPath(path);
        if (string.IsNullOrEmpty(schemaPath)) return null;

        var exact = schema.Fields.FirstOrDefault(f => f.Name == schemaPath);
        if (exact != null) return exact;

        var segments = schemaPath.Split('.');
        if (segments.Length == 0 || segments.Length > GraphQlConstant.MaxNestedLevelIterationLimit)
            return null;

        List<FieldDefinitionResponse>? currentLevel = schema.Fields;
        FieldDefinitionResponse? matched = null;

        for (var i = 0; i < segments.Length && currentLevel != null; i++)
        {
            var segment = segments[i];
            if (string.IsNullOrEmpty(segment)) continue;
            matched = currentLevel.FirstOrDefault(f => string.Equals(f.Name, segment, StringComparison.Ordinal));
            if (matched == null) return null;
            currentLevel = i < segments.Length - 1 ? matched.Fields : null;
        }

        return matched;
    }

    /// <summary>
    /// Returns true if the field should be excluded by CLS (custom with a CLS policy that does not grant access).
    /// When there are no CLS policies for this path/operation, do not exclude (e.g. schema uses only RLS for Custom).
    /// </summary>
    public static bool ShouldExcludeFieldByCls(SchemaDefinitionExtended schema, PolicyOperation operation, string fieldPath, SchemaAccessLevel schemaAccessLevel)
    {
        var applicablePolicies = schema.Policies
            .Where(p => (p.Operation == operation || p.Operation == PolicyOperation.ALL) && p.PolicyType == PolicyType.CLS && p.CoversPath(fieldPath))
            .ToList();
        if (applicablePolicies.Count == 0)
            return false;
        return applicablePolicies.All(p => !p.EvaluatePolicy().IsAccessGranted);
    }

    /// <summary>
    /// Gets schema access level for the given operation (Write/Edit/Delete/Read).
    /// </summary>
    public static SchemaAccessLevel GetSchemaAccessLevelForOperation(SchemaDefinitionExtended schema, PolicyOperation operation) =>
        operation == PolicyOperation.WRITE ? schema.WriteAccessLevel
            : operation == PolicyOperation.EDIT ? schema.EditAccessLevel
            : operation == PolicyOperation.DELETE ? schema.DeleteAccessLevel
            : schema.ReadAccessLevel;

    /// <summary>
    /// Evaluates CLS policies for mutation input paths and returns excluded fields.
    /// </summary>
    public static PolicyEvaluationResult EvaluateClsPoliciesForInput(SchemaDefinitionExtended schema, PolicyOperation operation, List<string> fieldPaths)
    {
        if (RequestContextAccessor.Current.IsRequestFromBlocksCloud)
            return new PolicyEvaluationResult { IsAccessGranted = true };

        var schemaAccessLevel = GetSchemaAccessLevelForOperation(schema, operation);
        var result = new PolicyEvaluationResult { IsAccessGranted = false };

        foreach (var path in fieldPaths.Distinct())
        {
            var fieldDef = GetFieldDefForPath(schema, path);
            if (fieldDef is null)
            {
                if (path != GraphQlConstant.DbEntityIdFieldName && !path.Contains('.'))
                    result.ExcludedFields.Add(path);
                continue;
            }
            var rawFieldLevel = operation == PolicyOperation.WRITE ? fieldDef.WriteAccessLevel : fieldDef.EditAccessLevel;
            var fieldAccessLevel = rawFieldLevel == SchemaAccessLevel.Inherited ? schemaAccessLevel : rawFieldLevel;
            if (fieldAccessLevel == SchemaAccessLevel.Public) continue;
            if (fieldAccessLevel == SchemaAccessLevel.User)
            {
                var isAuthenticated = BlocksContext.GetContext()?.IsAuthenticated ?? false;
                if (!isAuthenticated)
                    result.ExcludedFields.Add(path);
                continue;
            }
            if (fieldAccessLevel == SchemaAccessLevel.Custom && ShouldExcludeFieldByCls(schema, operation, path, schemaAccessLevel))
                result.ExcludedFields.Add(path);
        }
        return result;
    }

    /// <summary>
    /// Ensures OrganizationIds and Tags are non-null lists on insert.
    /// </summary>
    public static void EnsureDefaultListsForInsert(Dictionary<string, object?> input)
    {
        if (!input.ContainsKey(nameof(GraphQlBaseEntity.OrganizationIds)) || input[nameof(GraphQlBaseEntity.OrganizationIds)] is null)
            input[nameof(GraphQlBaseEntity.OrganizationIds)] = new List<string>();
        if (!input.ContainsKey(nameof(GraphQlBaseEntity.Tags)) || input[nameof(GraphQlBaseEntity.Tags)] is null)
            input[nameof(GraphQlBaseEntity.Tags)] = new List<string>();
    }

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
