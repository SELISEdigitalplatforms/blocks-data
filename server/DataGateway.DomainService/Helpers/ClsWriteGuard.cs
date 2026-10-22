using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Column (CLS) rules for Create and Edit, checked against a record. The generic input check
/// (<see cref="ClsInputHelper.EvaluateClsPoliciesForInput"/>) has no record, so a rule on a record field such as
/// <c>CreatedBy == {{Auth.UserId}}</c> always let the write through; on reads the same rule is checked per row.
/// Only fields whose access for the operation is Custom and that a column policy covers are checked here, the
/// same fields the generic check looks at; every other field keeps today's handling.
/// </summary>
public static class ClsWriteGuard
{
    /// <summary>
    /// The paths among <paramref name="paths"/> that the column policies refuse for <paramref name="record"/>:
    /// a covered field is allowed when any covering policy holds for the caller and the record.
    /// </summary>
    public static List<string> RefusedPaths(
        AccessPrincipal principal,
        SchemaDefinitionExtended schema,
        PolicyOperation operation,
        IEnumerable<string> paths,
        IDictionary<string, object?> record)
    {
        if (principal.IsRootTenant)
            return [];

        var policies = schema.Policies
            .Where(p => p.PolicyType == PolicyType.CLS && (p.Operation == operation || p.Operation == PolicyOperation.ALL))
            .ToList();
        if (policies.Count == 0)
            return [];

        var row = (IDictionary<string, object>)record!;
        var schemaLevel = ClsInputHelper.GetSchemaAccessLevelForOperation(schema, operation);
        var refused = new List<string>();
        foreach (var path in paths.Distinct().Where(path => IsCustom(schema, operation, path, schemaLevel)))
        {
            var covering = policies.Where(p => p.CoversPath(path)).ToList();
            if (covering.Count > 0 && !covering.Any(p => QueryPolicyRuleEvaluator.RowSatisfiesPolicy(principal, p, row)))
                refused.Add(path);
        }
        return refused;
    }

    /// <summary>Whether the field's access for the operation is Custom (its own level, or the schema's when it inherits).</summary>
    private static bool IsCustom(SchemaDefinitionExtended schema, PolicyOperation operation, string path, SchemaAccessLevel schemaLevel)
    {
        var field = ClsInputHelper.GetFieldDefForPath(schema, path);
        if (field is null)
            return false;

        var rawLevel = operation == PolicyOperation.WRITE ? field.WriteAccessLevel : field.EditAccessLevel;
        var level = rawLevel == SchemaAccessLevel.Inherited ? schemaLevel : rawLevel;
        return level == SchemaAccessLevel.Custom;
    }

    /// <summary>
    /// The paths of <paramref name="input"/> whose value differs from <paramref name="stored"/>. A value sent back
    /// unchanged (an edit form posting the whole record) is not a change, so a protected field may be resent freely.
    /// </summary>
    public static List<string> ChangedPaths(IDictionary<string, object?> input, BsonDocument stored)
    {
        var sent = new BsonDocument(input.Select(kv => new BsonElement(kv.Key, BsonValue.Create(kv.Value))));
        return ClsInputHelper.GetAllPathsFromInput(input, prefix: string.Empty)
            .Where(path => !Same(At(sent, path), At(stored, path)))
            .ToList();
    }

    private static BsonValue? At(BsonValue root, string path)
    {
        BsonValue? current = root;
        foreach (var segment in path.Split('.'))
        {
            current = current switch
            {
                BsonDocument document => document.TryGetValue(segment, out var value) ? value : null,
                BsonArray array when int.TryParse(segment, out var index) && index >= 0 && index < array.Count => array[index],
                _ => null,
            };
            if (current is null)
                return null;
        }
        return current;
    }

    /// <summary>Equal values, whatever the order of a document's properties or the width of a number.</summary>
    private static bool Same(BsonValue? sent, BsonValue? stored)
    {
        var sentEmpty = sent is null || sent.IsBsonNull;
        var storedEmpty = stored is null || stored.IsBsonNull;
        if (sentEmpty || storedEmpty)
            return sentEmpty && storedEmpty;

        return (sent, stored) switch
        {
            (BsonDocument a, BsonDocument b) => a.ElementCount == b.ElementCount
                && a.All(element => b.TryGetValue(element.Name, out var other) && Same(element.Value, other)),
            (BsonArray a, BsonArray b) => a.Count == b.Count && a.Zip(b).All(pair => Same(pair.First, pair.Second)),
            // BSON compares numbers by value across int, long and double.
            _ when sent!.IsNumeric && stored!.IsNumeric => sent.CompareTo(stored) == 0,
            _ => sent.Equals(stored),
        };
    }
}
