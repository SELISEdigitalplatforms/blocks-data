using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Schemas;

/// <summary>
/// Cuts a tenant's full schema source into one small source per entity: what a request on that entity
/// needs and nothing more.
/// </summary>
public static class EntityViewBuilder
{
    /// <summary>
    /// One mini source per <see cref="SchemaType.Entity"/> (a DTO is only ever part of an entity's view).
    /// Each holds the entity, every schema its fields name (transitively, cycles included), the entities
    /// its active lookup rules target (with the schemas they nest), the rules of the entity and its DTOs,
    /// the policies of all of those, and the system entities the rules point at. A target brings no
    /// rules of its own: a view only validates writes to its own entity, so a target's lookups are never
    /// needed and the view stays self-contained. Shares the definitions of
    /// <paramref name="fullSource"/>; pack the result before anything modifies them.
    /// </summary>
    public static IReadOnlyList<(string SchemaName, SchemaSource Source)> Build(SchemaSource fullSource)
    {
        var byName = new Dictionary<string, SchemaDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var schema in fullSource.SchemaDefinitions.Where(s => !string.IsNullOrWhiteSpace(s.SchemaName)))
            byName.TryAdd(schema.SchemaName, schema);
        var validationsBySchema = fullSource.DataValidations.ToLookup(v => v.SchemaId, StringComparer.Ordinal);
        // Only a tenant Entity of the same name takes a system target's place, as in SchemaAssembler.
        var tenantEntityNames = fullSource.SchemaDefinitions
            .Where(s => s.SchemaType == SchemaType.Entity)
            .Select(s => s.SchemaName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var views = new List<(string, SchemaSource)>();
        foreach (var entity in fullSource.SchemaDefinitions.Where(s => s.SchemaType == SchemaType.Entity))
        {
            var included = new Dictionary<string, SchemaDefinition>(StringComparer.Ordinal);
            AddWithNestedSchemas(entity, byName, included);
            // Whose rules the view carries: the entity's and its DTOs', not the lookup targets'.
            var ruleOwnerIds = included.Keys.ToHashSet(StringComparer.Ordinal);
            var ownSchemas = included.Values.ToList();

            // Rules on the entity and on the DTOs it nests; each lookup target joins with what it nests.
            var targetNames = LookupTargetNames(ownSchemas, validationsBySchema);
            foreach (var targetName in targetNames)
            {
                if (byName.TryGetValue(targetName, out var target) && target.SchemaType == SchemaType.Entity)
                    AddWithNestedSchemas(target, byName, included);
            }

            // Source order, so the same input always packs to the same view.
            var schemas = fullSource.SchemaDefinitions.Where(s => included.ContainsKey(s.ItemId)).ToList();
            var ids = included.Keys.ToHashSet(StringComparer.Ordinal);
            var validations = fullSource.DataValidations.Where(v => ruleOwnerIds.Contains(v.SchemaId)).ToList();

            var systemNames = targetNames
                .Where(name => !tenantEntityNames.Contains(name))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            views.Add((entity.SchemaName, new SchemaSource
            {
                SchemaDefinitions = schemas,
                DataValidations = validations,
                DataAccessPolicies = fullSource.DataAccessPolicies.Where(p => ids.Contains(p.SchemaId)).ToList(),
                SystemEntitySchemas = systemNames.Count == 0
                    ? []
                    : fullSource.SystemEntitySchemas.Where(s => systemNames.Contains(s.SchemaName)).ToList()
            }));
        }

        return views;
    }

    /// <summary>Adds <paramref name="root"/> and every schema its fields name, and theirs in turn; a schema already added ends the walk.</summary>
    private static void AddWithNestedSchemas(SchemaDefinition root, Dictionary<string, SchemaDefinition> byName, Dictionary<string, SchemaDefinition> included)
    {
        var pending = new Stack<SchemaDefinition>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var schema = pending.Pop();
            if (!included.TryAdd(schema.ItemId, schema))
                continue;
            foreach (var field in schema.Fields ?? [])
            {
                if (!string.IsNullOrWhiteSpace(field.Type) && byName.TryGetValue(field.Type, out var nested))
                    pending.Push(nested);
            }
        }
    }

    /// <summary>The target schema names of the active Reference and Must not exist in rules of <paramref name="schemas"/>.</summary>
    private static HashSet<string> LookupTargetNames(IEnumerable<SchemaDefinition> schemas, ILookup<string, DataValidation> validationsBySchema) =>
        schemas
            .SelectMany(s => validationsBySchema[s.ItemId])
            .SelectMany(v => v.Validations ?? [])
            .Where(r => r.IsActive && ReferenceTargets.IsLookupRule(r))
            .Select(ReferenceTargets.TargetSchemaName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
}
