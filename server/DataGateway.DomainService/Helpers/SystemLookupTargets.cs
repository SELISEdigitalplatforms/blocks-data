using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// What of a system entity a Reference or Must not exist in rule may look at, as its target field or in its filter:
/// only an entity Genesis opens to rules (<c>[SystemSchemaRules]</c>), and on it only ItemId and the properties open to
/// validation rules (<c>[AllowRules]</c>). Everything else, such as passwords, security stamps, tokens and whole
/// credential schemas, is never offered, saved or looked up: a lookup on it would tell whether a guessed value exists.
/// </summary>
public static class SystemLookupTargets
{
    /// <summary>
    /// <paramref name="schema"/> as a lookup target: a tenant schema unchanged; a system entity as a copy holding only
    /// the properties it may be looked up by, or null when none of it may be.
    /// </summary>
    public static SchemaDefinition? Restrict(SchemaDefinition? schema)
    {
        if (schema is null || !schema.IsSystemEntity)
            return schema;
        var rules = SystemSchemaRules.For(schema.SchemaName);
        if (rules is null)
            return null;
        return new SchemaDefinition
        {
            ItemId = schema.ItemId,
            SchemaName = schema.SchemaName,
            SchemaType = schema.SchemaType,
            CollectionName = schema.CollectionName,
            Description = schema.Description,
            IsSystemEntity = true,
            IsDeleted = schema.IsDeleted,
            Fields = schema.Fields.Where(f => IsOpen(rules, f.Name)).ToList(),
        };
    }

    /// <summary>Names of the system entities that may be lookup targets at all.</summary>
    public static IReadOnlyCollection<string> SchemaNames => SystemSchemaRules.SchemaNames;

    /// <summary>True when the system entity's property <paramref name="path"/> may be a target field or named in a filter.</summary>
    public static bool IsOpen(string schemaName, string path) =>
        SystemSchemaRules.For(schemaName) is { } rules && IsOpen(rules, path);

    private static bool IsOpen(SystemSchemaRuleSet rules, string path) =>
        path == ReferenceTargets.DefaultTargetField || rules.ValidationFor(path) != RuleAccess.Blocked;
}
