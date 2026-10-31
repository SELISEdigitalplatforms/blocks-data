using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using FluentValidation;
using MongoDB.Driver;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Rules;

namespace DataGateway.DomainService.Validators;

/// <summary>
/// Validates a batch of schemas being bulk-imported against the same rules the live
/// create/update schema API enforces, so a document that fails here would also have
/// been rejected through the normal single-schema endpoints.
/// </summary>
public class SchemaImportValidator
{
    private readonly IDbRepository _dbRepository;
    private static readonly PolicyRuleGroupValidator RuleGroupValidator = new();

    public SchemaImportValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository ?? throw new ArgumentNullException(nameof(dbRepository));
    }

    /// <summary>What every document is checked against, loaded once per import.</summary>
    private sealed record ImportContext(
        HashSet<string> SchemaNamesInBatch,
        HashSet<string> ExistingCustomSchemaNames,
        HashSet<string> SystemCollectionNames,
        Dictionary<string, SchemaDefinition> ReferenceTargets);

    public async Task<List<string>> ValidateAsync(List<SchemaExportDocument> documents)
    {
        var errors = new List<string>();
        var context = await LoadContextAsync(documents);
        var seenSchemaNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < documents.Count; i++)
            ValidateDocument(documents[i], $"Document[{i}]", context, seenSchemaNames, errors);

        return errors;
    }

    private async Task<ImportContext> LoadContextAsync(List<SchemaExportDocument> documents)
    {
        // Field types are valid if they're a known GraphQL scalar, or the name of another
        // schema (a nested/custom type) either defined in this same import file or already
        // present in the system. Anything else (e.g. "Decimal", "Long") must be rejected here,
        // rather than being persisted and only failing later when the GraphQL schema is built.
        var schemaNamesInBatch = new HashSet<string>(
            documents.Select(d => d.SchemaName).Where(n => !string.IsNullOrWhiteSpace(n)),
            StringComparer.OrdinalIgnoreCase);

        var referencedNonScalarTypes = documents
            .SelectMany(d => d.Fields ?? [])
            .Where(f => !DefaultValueInjection.IsBaseEntityField(f.Name, f.Type))
            .Select(f => f.Type)
            .Where(t => !string.IsNullOrWhiteSpace(t) && !GraphQlTypeHelper.IsScalar(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Except(schemaNamesInBatch, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Collection names of system entities are reserved: an imported schema must not point at them.
        var systemSchemas = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
            Builders<SchemaDefinition>.Filter.Eq(s => s.IsSystemEntity, true));
        var systemCollectionNames = new HashSet<string>(
            (systemSchemas ?? []).Select(s => s.CollectionName).Where(n => !string.IsNullOrWhiteSpace(n)),
            StringComparer.OrdinalIgnoreCase);

        return new ImportContext(
            schemaNamesInBatch,
            await LoadExistingCustomSchemaNamesAsync(referencedNonScalarTypes),
            systemCollectionNames,
            await LoadReferenceTargetsAsync(documents));
    }

    private async Task<HashSet<string>> LoadExistingCustomSchemaNamesAsync(List<string> referencedNonScalarTypes)
    {
        var existingCustomSchemaNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (referencedNonScalarTypes.Count == 0)
            return existingCustomSchemaNames;

        var existingSchemas = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
            Builders<SchemaDefinition>.Filter.And(
                Builders<SchemaDefinition>.Filter.In(s => s.SchemaName, referencedNonScalarTypes),
                Builders<SchemaDefinition>.Filter.Ne(s => s.IsSystemEntity, true)));
        foreach (var schema in existingSchemas)
            existingCustomSchemaNames.Add(schema.SchemaName);
        return existingCustomSchemaNames;
    }

    private static void ValidateDocument(SchemaExportDocument doc, string prefix, ImportContext context, HashSet<string> seenSchemaNames, List<string> errors)
    {
        ValidateSchemaName(doc, prefix, seenSchemaNames, errors);

        RequireDefined(doc.SchemaType, "SchemaType", prefix, errors);
        RequireDefined(doc.ReadAccessLevel, "ReadAccessLevel", prefix, errors);
        RequireDefined(doc.WriteAccessLevel, "WriteAccessLevel", prefix, errors);
        RequireDefined(doc.EditAccessLevel, "EditAccessLevel", prefix, errors);
        RequireDefined(doc.DeleteAccessLevel, "DeleteAccessLevel", prefix, errors);

        ValidateCollectionName(doc, prefix, context.SystemCollectionNames, errors);

        if (!SchemaDescription.HasValidLength(doc.Description))
            errors.Add($"{prefix}: Description must be at most {SchemaDescription.MaxLength} characters.");

        if (doc.Fields == null || doc.Fields.Count == 0)
            errors.Add($"{prefix}: At least one field is required.");

        foreach (var policy in doc.RowLevelPolicies ?? [])
            ValidateAccessPolicy(policy, $"{prefix}.RowLevelPolicy[{policy.PolicyName}]", errors);

        var seenFieldNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var importFields = ImportFields(doc);
        foreach (var field in doc.Fields ?? [])
            ValidateField(doc, field, prefix, context, seenFieldNames, importFields, errors);
    }

    private static void ValidateSchemaName(SchemaExportDocument doc, string prefix, HashSet<string> seenSchemaNames, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(doc.SchemaName))
        {
            errors.Add($"{prefix}: SchemaName is required.");
            return;
        }

        if (!seenSchemaNames.Add(doc.SchemaName))
            errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' is used by more than one document in this import file. Schema names must be unique.");

        if (doc.SchemaName.Length > 50)
            errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' must be between 1 and 50 characters.");
        else if (!SchemaValidatorHelper.NameAllowedPattern.IsMatch(doc.SchemaName))
            errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' may only contain letters, numbers, and underscore, and cannot start with a number.");
    }

    private static void ValidateCollectionName(SchemaExportDocument doc, string prefix, HashSet<string> systemCollectionNames, List<string> errors)
    {
        if (!SchemaValidatorHelper.DoesNotEmptyCollectionName(doc.CollectionName, doc.SchemaType))
        {
            errors.Add($"{prefix}: CollectionName is required for an Entity schema.");
            return;
        }
        if (doc.SchemaType != SchemaType.Entity)
            return;

        if (!SchemaValidatorHelper.IsValidCollectionNameLength(doc.CollectionName, doc.SchemaType))
            errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' must be between 1 and 50 characters.");
        else if (!SchemaValidatorHelper.IsAllowedCollectionName(doc.CollectionName, doc.SchemaType))
            errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' may only contain letters, numbers, and underscore, and cannot start with a number.");
        if (systemCollectionNames.Contains(doc.CollectionName.Trim()))
            errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' is reserved by a system entity.");
    }

    private static void ValidateField(
        SchemaExportDocument doc,
        ExportFieldDefinition field,
        string prefix,
        ImportContext context,
        HashSet<string> seenFieldNames,
        Dictionary<string, VariableField> importFields,
        List<string> errors)
    {
        var fieldPrefix = $"{prefix}.{field.Name}";
        ValidateFieldName(field, prefix, seenFieldNames, errors);
        ValidateFieldType(field, fieldPrefix, context, errors);

        RequireDefined(field.ReadAccessLevel, "ReadAccessLevel", fieldPrefix, errors);
        RequireDefined(field.WriteAccessLevel, "WriteAccessLevel", fieldPrefix, errors);
        RequireDefined(field.EditAccessLevel, "EditAccessLevel", fieldPrefix, errors);
        RequireDefined(field.DeleteAccessLevel, "DeleteAccessLevel", fieldPrefix, errors);

        foreach (var policy in field.AccessPolicies ?? [])
            ValidateAccessPolicy(policy, $"{fieldPrefix}.Policy[{policy.PolicyName}]", errors);

        if (field.ValidationRules != null)
            ValidateFieldRules(doc, field, fieldPrefix, context, importFields, errors);

        if (field.DefaultValue is not null
            && FieldDefaultValueCheck.Check(field.Name, field.Type, field.IsArray, field.EnumValues,
                   field.DefaultValue.ToStorable()!, doc.SchemaName, importFields) is { } problem)
            errors.Add($"{fieldPrefix}: {problem}");
    }

    private static void ValidateFieldName(ExportFieldDefinition field, string prefix, HashSet<string> seenFieldNames, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(field.Name))
        {
            errors.Add($"{prefix}: A field is missing a Name.");
            return;
        }

        if (!seenFieldNames.Add(field.Name))
            errors.Add($"{prefix}: Field name '{field.Name}' must be unique within a schema.");

        // Reference fields (e.g. "Address.City") are stored as dotted paths. Each
        // segment is an actual schema field name and must satisfy the normal field-name
        // rules, but the combined path may legitimately exceed 50 characters.
        var namesToCheck = field.IsReferenceField ? field.Name.Split('.') : [field.Name];
        if (namesToCheck.Any(name => name.Length is < 1 or > 50))
            errors.Add($"{prefix}: Field name '{field.Name}' must be between 1 and 50 characters.");
        else if (namesToCheck.Any(name => !SchemaValidatorHelper.NameAllowedPattern.IsMatch(name)))
            errors.Add($"{prefix}: Field name '{field.Name}' may only contain letters, numbers, and underscore, and cannot start with a number.");
    }

    private static void ValidateFieldType(ExportFieldDefinition field, string fieldPrefix, ImportContext context, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(field.Type))
        {
            errors.Add($"{fieldPrefix}: Field Type is required.");
            return;
        }

        if (!GraphQlTypeHelper.IsScalar(field.Type) &&
            !DefaultValueInjection.IsBaseEntityField(field.Name, field.Type) &&
            !context.SchemaNamesInBatch.Contains(field.Type) &&
            !context.ExistingCustomSchemaNames.Contains(field.Type))
        {
            errors.Add(
                $"{fieldPrefix}: Type '{field.Type}' is not a supported field type." +
                $"{GetTypeSuggestionHint(field.Type)} Supported types are String, Int, Float, " +
                "Boolean, DateTime, ID, or the name of another schema in this import (for nested/custom object fields).");
        }
    }

    private static void ValidateFieldRules(
        SchemaExportDocument doc,
        ExportFieldDefinition field,
        string fieldPrefix,
        ImportContext context,
        Dictionary<string, VariableField> importFields,
        List<string> errors)
    {
        foreach (var rule in field.ValidationRules!)
        {
            if (!Enum.IsDefined(rule.Type))
            {
                errors.Add($"{fieldPrefix}: ValidationType '{rule.Type}' is not a valid value.");
                continue;
            }

            if (rule.Value is null && rule.Type is not (ValidationType.NotEmpty or ValidationType.UniqueItems))
                errors.Add($"{fieldPrefix}: Value is required for validation type '{rule.Type}'.");

            if (rule.SecondaryValue is null && rule.Type is ValidationType.Range or ValidationType.LengthRange)
                errors.Add($"{fieldPrefix}: SecondaryValue is required for validation type '{rule.Type}'.");
        }

        ValidateReferenceRules(field, context.ReferenceTargets, fieldPrefix, errors);

        var ruleField = new RuleField(field.Name, field.Type, field.IsArray, field.EnumValues);
        var newRuleProblems = new HashSet<string>(StringComparer.Ordinal);
        foreach (var rule in field.ValidationRules!.Where(r => Enum.IsDefined(r.Type)).Select(r => r.MapToValidationRule()))
        {
            if (ValidationVariableCheck.Check(rule, field.Type, doc.SchemaName, importFields) is { } problem)
                errors.Add($"{fieldPrefix}: {problem}");
            foreach (var newRuleProblem in ValidationRuleCheck.Check(rule, ruleField, doc.SchemaName, systemSchema: false, importFields))
            {
                if (newRuleProblems.Add(newRuleProblem))
                    errors.Add($"{fieldPrefix}: {newRuleProblem}");
            }
        }
    }

    private static void RequireDefined<TEnum>(TEnum value, string name, string prefix, List<string> errors) where TEnum : struct, Enum
    {
        if (!Enum.IsDefined(value))
            errors.Add($"{prefix}: {name} '{value}' is not a valid value.");
    }

    /// <summary>
    /// Reference and Must not exist in rules point at a schema by name: it must be an Entity in this import file or
    /// already in the project, with a matching single-value target field (the same checks as the validation API).
    /// </summary>
    private static void ValidateReferenceRules(
        ExportFieldDefinition field,
        IReadOnlyDictionary<string, SchemaDefinition> targets,
        string prefix,
        List<string> errors)
    {
        var lookups = (field.ValidationRules ?? []).Where(r => r.Type is ValidationType.Reference or ValidationType.NotExistsIn).ToList();
        if (lookups.Count == 0)
            return;
        if (lookups.Count(r => r.Type == ValidationType.Reference) > 1)
        {
            errors.Add($"{prefix}: {ReferenceRuleCompatibility.OnlyOneReference}");
            return;
        }
        if (lookups.Count(r => r.Type == ValidationType.NotExistsIn) > 1)
        {
            errors.Add($"{prefix}: {DataValidationRequestValidatorMessages.OnlyOneMustNotExistIn}");
            return;
        }

        var source = new FieldDefinition { Name = field.Name, Type = field.Type, IsArray = field.IsArray };
        foreach (var lookup in lookups)
        {
            var rule = new ValidationRule { Type = lookup.Type, Value = lookup.Value, SecondaryValue = lookup.SecondaryValue };
            var targetName = ReferenceTargets.TargetSchemaName(rule);
            var target = targets.GetValueOrDefault(targetName);
            var problem = ReferenceRuleCompatibility.Check(source, target, ReferenceTargets.TargetFieldName(rule));
            if (problem is not null)
                errors.Add($"{prefix}: {(lookup.Type == ValidationType.Reference ? "Reference to" : "Must not exist in")} '{targetName}.{ReferenceTargets.TargetFieldName(rule)}' is not valid ({problem})");
            errors.AddRange(DataValidationRequestValidatorMessages.FilterProblems(lookup.TargetFilter, target).Select(p => $"{prefix}: {p}"));
        }
    }

    /// <summary>Schemas that Reference and Must not exist in rules in <paramref name="documents"/> may point at: the file's own, then the project's.</summary>
    private async Task<Dictionary<string, SchemaDefinition>> LoadReferenceTargetsAsync(List<SchemaExportDocument> documents)
    {
        var targets = new Dictionary<string, SchemaDefinition>(StringComparer.Ordinal);
        var names = documents
            .SelectMany(d => d.Fields ?? [])
            .SelectMany(f => f.ValidationRules ?? [])
            .Where(r => r.Type is ValidationType.Reference or ValidationType.NotExistsIn)
            .Select(r => ReferenceTargets.TargetSchemaName(new ValidationRule { Value = r.Value }))
            .Where(n => n.Length > 0)
            .ToHashSet(StringComparer.Ordinal);
        if (names.Count == 0)
            return targets;

        foreach (var doc in documents.Where(d => names.Contains(d.SchemaName)))
        {
            targets[doc.SchemaName] = new SchemaDefinition
            {
                SchemaName = doc.SchemaName,
                SchemaType = doc.SchemaType,
                Fields = (doc.Fields ?? []).Select(f => new FieldDefinition
                {
                    Name = f.Name, Type = f.Type, IsArray = f.IsArray, IsReferenceField = f.IsReferenceField,
                }).ToList(),
            };
        }

        var missing = names.Where(n => !targets.ContainsKey(n)).ToList();
        if (missing.Count > 0)
        {
            var existing = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
                Builders<SchemaDefinition>.Filter.And(
                    Builders<SchemaDefinition>.Filter.In(s => s.SchemaName, missing),
                    Builders<SchemaDefinition>.Filter.Eq(s => s.IsDeleted, false)));
            // The tenant's own Entity of a name before a system entity of the same name, as the schema build picks it.
            // A system entity holds only what a lookup may see.
            foreach (var schema in (existing ?? []).OrderBy(s => s.IsSystemEntity))
            {
                if (!targets.ContainsKey(schema.SchemaName) && SystemLookupTargets.Restrict(schema) is { } target)
                    targets.Add(schema.SchemaName, target);
            }
        }
        return targets;
    }

    /// <summary>What a default's template may refer to: the file's own fields for that schema.</summary>
    private static Dictionary<string, VariableField> ImportFields(SchemaExportDocument doc) =>
        VariableSyntax.FieldsOf((doc.Fields ?? []).Select(f => new FieldDefinition { Name = f.Name, Type = f.Type, IsArray = f.IsArray }));

    private static void ValidateAccessPolicy(ExportAccessPolicy policy, string prefix, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(policy.PolicyName))
            errors.Add($"{prefix}: PolicyName is required.");
        else if (policy.PolicyName.Length > 200)
            errors.Add($"{prefix}: PolicyName must not exceed 200 characters.");

        if (policy.PolicyDescription?.Length > 2000)
            errors.Add($"{prefix}: PolicyDescription must not exceed 2000 characters.");

        if (!Enum.IsDefined(policy.PolicyType))
            errors.Add($"{prefix}: PolicyType '{policy.PolicyType}' is not a valid value.");

        if (!Enum.IsDefined(policy.Operation))
            errors.Add($"{prefix}: Operation '{policy.Operation}' is not a valid value.");

        if (policy.RuleGroup == null)
        {
            errors.Add($"{prefix}: RuleGroup is required.");
            return;
        }

        var result = RuleGroupValidator.Validate(policy.RuleGroup);
        foreach (var failure in result.Errors)
            errors.Add($"{prefix}.RuleGroup.{failure.PropertyName}: {failure.ErrorMessage}");
    }

    private static string GetTypeSuggestionHint(string type) => type.Trim().ToLowerInvariant() switch
    {
        "decimal" or "double" or "number" => " Use 'Float' instead.",
        "long" or "short" or "byte" => " Use 'Int' instead.",
        "bool" => " Use 'Boolean' instead.",
        "guid" or "uuid" => " Use 'String' instead.",
        "date" or "timestamp" => " Use 'DateTime' instead.",
        _ => ""
    };
}
