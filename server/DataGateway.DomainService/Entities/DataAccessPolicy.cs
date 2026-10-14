using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Entities;

/// <summary>
/// Data-service helpers for <see cref="DataAccessPolicy"/> (the class itself lives in SeliseBlocks.Genesis.OS, namespace Blocks.Genesis.Entities.Data).
/// Same name and behaviour as the former instance method; it needs data-only <see cref="DataAccessPolicyHelper"/>, so it stays here.
/// </summary>
public static class DataAccessPolicyExtensions
{
    /// <summary>
    /// Returns true if this policy's FieldNames cover the given path.
    /// A path is covered if it equals a FieldName (e.g. "ContactInfo") or is a nested path under a FieldName (e.g. "ContactInfo.Email" when FieldNames contains "ContactInfo").
    /// Root properties: ["Name"] covers only "Name". Nested: ["ContactInfo"] covers "ContactInfo", "ContactInfo.Email", "ContactInfo.HomeAddress.House", etc.
    /// </summary>
    public static bool CoversPath(this DataAccessPolicy policy, string path)
    {
        if (string.IsNullOrEmpty(path) || policy.FieldNames == null || policy.FieldNames.Length == 0)
            return false;
        foreach (var fieldName in policy.FieldNames)
        {
            if (string.IsNullOrEmpty(fieldName)) continue;
            if (path == fieldName) return true;
            if (path.StartsWith(fieldName + ".", StringComparison.Ordinal)) return true;
            if (DataAccessPolicyHelper.RowPathMatchesSchemaPath(fieldName, path)) return true;
        }
        return false;
    }
}

/// <summary>
/// Result of evaluating a policy rule group.
/// </summary>
public class PolicyEvaluationResult
{
    /// <summary>
    /// Whether access is granted based on token validation.
    /// </summary>
    public bool IsAccessGranted { get; set; }

    /// <summary>
    /// MongoDB filter to apply for data-level filtering.
    /// Empty document means no additional filtering needed.
    /// </summary>
    public BsonDocument DataFilter { get; set; } = new();

    /// <summary>
    /// Fields that should be excluded from the result (for CLS).
    /// </summary>
    public List<string> ExcludedFields { get; set; } = [];

    /// <summary>
    /// Error message if evaluation failed.
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Indicates if the policy requires a database filter vs pure token validation.
    /// </summary>
    public bool RequiresDataFilter { get; set; }
}
