using System.Diagnostics;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using DataGateway.Rest.Parsing;

namespace DataGateway.Rest.Access;

/// <summary>
/// Refuses (403) a <c>where</c> or <c>order</c> on a field a read column rule covers (spec delta 4), or on a DTO with
/// such a field beneath it (R32, defense in depth: the parser already refuses a sort on a DTO): which rows a
/// filter keeps, or the order a sort gives, would reveal the value the rule masks. Every read column policy Genesis
/// returns for the request counts, conditional ones included, since masking can depend on the row and a field masked
/// on some rows is enough. The root tenant, whose reads are never masked, is exempt. <c>select</c> is not refused:
/// masked values are masked per row by the engine, as GraphQL does.
///
/// One kind of read column policy is not a column rule of its own and does not count: the copies of the entity's row
/// rules that schema assembly (<see cref="SchemaPolicyDerivation.SetFieldsPolicies"/>) gives every scalar field whose
/// read level is <c>Inherited</c> on a Custom-read entity. They mask a field exactly on the rows the row rules hide,
/// and the row rules already keep those rows out of every result and count, so a filter on such a field reveals
/// nothing. (Assembly replaces any column policy written for an inherited scalar field with these copies, so such a
/// field never has a column rule of its own.) Counting them would refuse every filter and sort on a Custom-read entity.
///
/// Fields the masker hides without any policy are refused too (<see cref="MaskedPaths"/>): Custom-level fields no
/// column policy covers, every field of a Custom-read entity with no column policy at all, and User-level fields for
/// an anonymous caller.
/// </summary>
internal static class ColumnRuleGuard
{
    private const string And = "and";
    private const string Or = "or";
    private const string ItemIdField = "ItemId";

    public static void Check(
        IDataAccessPolicyResolutionService resolver,
        AccessPrincipal principal,
        EntityModel entity,
        WhereNode? where,
        IReadOnlyList<OrderItem>? order)
    {
        // The masker leaves the root tenant's rows untouched.
        if (principal.IsRootTenant || (where is null && order is not { Count: > 0 }))
            return;

        var paths = PathsOf(entity, where, order);
        if (paths.Count == 0)
            return;

        var request = new SchemaAccessRequest(principal, entity.Schema, PolicyOperation.READ);
        var policies = resolver.BuildReadProjection(request, paths.ToList()).ClsReadPolicies;
        var masked = MaskedPaths(principal, entity.Schema, policies);
        var protectedPath = paths.FirstOrDefault(path =>
            policies.Any(policy => Protects(policy, path, entity))
            // The id is stored as _id, which the masker never touches.
            // A masked path at, above or (for a whole DTO) beneath the path.
            || (path != ItemIdField && (masked.All || masked.Paths.Any(maskedPath => IsAtOrUnder(path, maskedPath) || IsAtOrUnder(maskedPath, path)))));
        if (protectedPath is null)
            return;

        var message = $"Field '{protectedPath}' cannot be used in 'where' or 'order': a column access rule protects it.";
        GatewayOperationActivity.MarkFailed(
            Activity.Current, GatewayFailureKind.Authorization, message, GraphQlConstant.ForbiddenErrorCode);
        throw new GatewayException(GraphQlConstant.ForbiddenErrorCode, message);
    }

    /// <summary>
    /// Whether <paramref name="policy"/> is a column rule over <paramref name="path"/>: it names the path or a parent
    /// of it, or (for a path that is a whole DTO) a field beneath it, and that named field is not an inherited scalar
    /// (whose read policies are row-rule copies).
    /// </summary>
    internal static bool Protects(DataAccessPolicy policy, string path, EntityModel entity) =>
        policy.FieldNames.Any(name =>
            !string.IsNullOrEmpty(name)
            && !IsRowRuleCopyTarget(entity.Schema, name)
            && ((IsAtOrUnder(path, name) && ClsProjectionHelper.PolicyCoversAnyRequestedField(policy, [path]))
                || IsUnder(name, path)));

    /// <summary>
    /// What the row masker (<see cref="QueryClsRowMaskingHelper.MaskRowByClsPolicies"/>) masks for this caller apart
    /// from the policy-evaluated paths, by the same rules, so the guard refuses exactly what the masker could hide:
    /// <list type="bullet">
    /// <item>with no read column policy on a Custom-read entity, every field (<c>ApplyCustomSchemaMaskWhenNoCls</c>);</item>
    /// <item>with column policies, every path at the effective Custom read level that none of them covers
    /// (<c>MaskCustomFieldsWithNoPolicy</c>);</item>
    /// <item>for an anonymous caller, every path at the effective User read level (<c>MaskUserOnlyFieldsWhenUnauthenticated</c>).</item>
    /// </list>
    /// A masked path hides everything under it.
    /// </summary>
    internal static (bool All, IReadOnlyCollection<string> Paths) MaskedPaths(
        AccessPrincipal principal, SchemaDefinitionExtended schema, IReadOnlyCollection<DataAccessPolicy> clsReadPolicies)
    {
        if (clsReadPolicies.Count == 0 && schema.ReadAccessLevel == SchemaAccessLevel.Custom)
            return (true, []);

        var levels = QueryClsRowMaskingHelper.GetPathsWithEffectiveReadAccessLevel(schema);
        var masked = new HashSet<string>(StringComparer.Ordinal);
        var covered = clsReadPolicies.SelectMany(p => p.FieldNames).Distinct().ToHashSet();
        if (covered.Count > 0)
        {
            masked.UnionWith(levels
                .Where(t => t.EffectiveReadLevel == SchemaAccessLevel.Custom
                            && !DataAccessPolicyHelper.IsPathCoveredByClsFieldNames(t.Path, covered))
                .Select(t => t.Path));
        }
        if (!QueryClsRowMaskingHelper.IsRequestAuthenticated(principal))
        {
            masked.UnionWith(levels
                .Where(t => t.EffectiveReadLevel == SchemaAccessLevel.User)
                .Select(t => t.Path));
        }
        return (false, masked);
    }

    private static bool IsAtOrUnder(string path, string ancestor) =>
        path == ancestor || IsUnder(path, ancestor);

    private static bool IsUnder(string path, string ancestor) =>
        path.StartsWith(ancestor + ".", StringComparison.Ordinal);

    /// <summary>
    /// A scalar field left at the <c>Inherited</c> read level. Walked through <c>field.Fields</c> only, as schema
    /// derivation walks it. A path that does not resolve is not one, so a policy on it counts.
    /// </summary>
    private static bool IsRowRuleCopyTarget(SchemaDefinitionExtended schema, string fieldPath)
    {
        IList<FieldDefinitionResponse>? fields = schema.Fields;
        FieldDefinitionResponse? field = null;
        foreach (var segment in fieldPath.Split('.'))
        {
            field = fields is null ? null : FieldPaths.Find(fields, segment);
            if (field is null)
                return false;
            fields = field.Fields;
        }
        return field is not null
            && SchemaTypeHelper.IsScalar(field.Type)
            && field.ReadAccessLevel == SchemaAccessLevel.Inherited;
    }

    /// <summary>
    /// The field paths a filter and a sort read: each condition's field (a DTO's fields as <c>Dto.Field</c>), through
    /// <c>and</c> / <c>or</c>, and each sort field. In the order first seen. DTO fields are walked through
    /// <c>field.Fields</c> only, as schema derivation and the masker walk them.
    /// </summary>
    internal static IReadOnlyCollection<string> PathsOf(EntityModel entity, WhereNode? where, IReadOnlyList<OrderItem>? order)
    {
        var paths = new List<string>();
        if (where is not null)
            CollectFilter(where.Root, entity.Schema.Fields, prefix: "", paths);
        foreach (var item in order ?? [])
            Add(paths, item.Field);
        return paths;
    }

    private static void CollectFilter(
        IReadOnlyDictionary<string, object?> filter,
        IList<FieldDefinitionResponse>? fields,
        string prefix,
        List<string> paths)
    {
        foreach (var (key, value) in filter)
        {
            if (prefix.Length == 0 && key is And or Or)
            {
                foreach (var item in value as IEnumerable<object?> ?? [])
                {
                    if (item is IReadOnlyDictionary<string, object?> nested)
                        CollectFilter(nested, fields, prefix, paths);
                }
                continue;
            }

            var path = FieldPaths.Join(prefix, key);
            var field = fields is null ? null : FieldPaths.Find(fields, key);
            // A DTO's filter holds its fields; a scalar's holds operators.
            if (field is not null && !SchemaTypeHelper.IsScalar(field.Type) && value is IReadOnlyDictionary<string, object?> dtoFilter)
                CollectFilter(dtoFilter, field.Fields, path, paths);
            else
                Add(paths, path);
        }
    }

    private static void Add(List<string> paths, string path)
    {
        if (!paths.Contains(path, StringComparer.Ordinal))
            paths.Add(path);
    }
}
