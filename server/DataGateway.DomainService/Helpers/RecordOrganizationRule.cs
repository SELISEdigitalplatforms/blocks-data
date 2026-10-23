using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// A record's OrganizationId is the caller's organization (the organization claim of the BlocksContext).
/// <list type="bullet">
/// <item>Insert: OrganizationId absent is left to the schema's field default, else the caller's organization
/// (<see cref="DefaultValueInjection.InjectDefaultValueOnInsert"/>); blank is set to the caller's organization;
/// equal is kept; any other value refuses the mutation. Only the values the caller sent are checked.</item>
/// <item>Update: OrganizationId absent is untouched; equal is kept; any other value (blank included) refuses the mutation.</item>
/// </list>
/// Callers that may set any OrganizationId: callers whose organization is tenant-wide (blank or "default",
/// as <see cref="StringHelper.IsNullOrWhiteSpaceOrDefault"/>), root-tenant callers, and calls without an
/// authenticated user context. A refused mutation throws before anything is written.
/// Organization ids are compared ordinal (exact), as they are matched in MongoDB.
/// </summary>
public static class RecordOrganizationRule
{
    public const string FieldName = nameof(GraphQlBaseEntity.OrganizationId);
    public const string ErrorMessage = "OrganizationId must be your organization.";
    public const string ValidationType = "Organization";

    /// <summary>True when the caller may set any OrganizationId on a record.</summary>
    public static bool MaySetAnyOrganization(AccessPrincipal principal) =>
        !principal.HasContext
        || !principal.IsAuthenticated
        || principal.IsRootTenant
        || principal.OrganizationId.IsNullOrWhiteSpaceOrDefault();

    /// <summary>Applies the rule to every insert input; throws a validation error if any input names another organization.</summary>
    public static void EnsureForInsert(IReadOnlyList<Dictionary<string, object?>> inputs, AccessPrincipal principal)
    {
        if (MaySetAnyOrganization(principal)) return;

        var result = new DataValidationResult();
        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            if (!input.TryGetValue(FieldName, out var value)) continue;
            if (IsBlank(value))
                input[FieldName] = principal.OrganizationId;
            else if (!IsCallerOrganization(value, principal))
                AddError(result, i, inputs.Count > 1);
        }
        ThrowIfInvalid(result);
    }

    /// <summary>Applies the rule to an update input; throws a validation error if it names another organization.</summary>
    public static void EnsureForUpdate(Dictionary<string, object?> input, AccessPrincipal principal)
    {
        if (MaySetAnyOrganization(principal)) return;
        if (!input.TryGetValue(FieldName, out var value)) return;

        var result = new DataValidationResult();
        if (!IsCallerOrganization(value, principal))
            AddError(result, 0, isBatch: false);
        ThrowIfInvalid(result);
    }

    private static bool IsBlank(object? value) => value is null || (value is string s && string.IsNullOrWhiteSpace(s));

    private static bool IsCallerOrganization(object? value, AccessPrincipal principal) =>
        value is string organizationId && string.Equals(organizationId, principal.OrganizationId, StringComparison.Ordinal);

    private static void AddError(DataValidationResult result, int index, bool isBatch) =>
        result.AddError(FieldName, (isBatch ? $"Item {index}: " : string.Empty) + ErrorMessage, ValidationType);

    private static void ThrowIfInvalid(DataValidationResult result)
    {
        if (!result.IsValid)
            MutationValidationHelper.ThrowValidationError(result);
    }
}
