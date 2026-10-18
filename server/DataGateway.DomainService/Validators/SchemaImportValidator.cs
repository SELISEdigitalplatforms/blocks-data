using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Repositories;
using FluentValidation;
using MongoDB.Driver;
using Blocks.Genesis.Entities.Data;

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

    public async Task<List<string>> ValidateAsync(List<SchemaExportDocument> documents)
    {
        var errors = new List<string>();

        // Field types are valid if they're a known GraphQL scalar, or the name of another
        // schema (a nested/custom type) either defined in this same import file or already
        // present in the system. Anything else (e.g. "Decimal", "Long") must be rejected here,
        // rather than being persisted and only failing later when the GraphQL schema is built.
        var schemaNamesInBatch = new HashSet<string>(
            documents.Select(d => d.SchemaName).Where(n => !string.IsNullOrWhiteSpace(n)),
            StringComparer.OrdinalIgnoreCase);

        var referencedNonScalarTypes = documents
            .SelectMany(d => d.Fields ?? [])
            .Select(f => f.Type)
            .Where(t => !string.IsNullOrWhiteSpace(t) && !GraphQlTypeHelper.IsScalar(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Except(schemaNamesInBatch, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var existingCustomSchemaNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (referencedNonScalarTypes.Count > 0)
        {
            var existingSchemas = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
                Builders<SchemaDefinition>.Filter.And(
                    Builders<SchemaDefinition>.Filter.In(s => s.SchemaName, referencedNonScalarTypes),
                    Builders<SchemaDefinition>.Filter.Ne(s => s.IsSystemEntity, true)));
            foreach (var schema in existingSchemas)
                existingCustomSchemaNames.Add(schema.SchemaName);
        }

        // Collection names of system entities are reserved: an imported schema must not point at them.
        var systemSchemas = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
            Builders<SchemaDefinition>.Filter.Eq(s => s.IsSystemEntity, true));
        var systemCollectionNames = new HashSet<string>(
            (systemSchemas ?? []).Select(s => s.CollectionName).Where(n => !string.IsNullOrWhiteSpace(n)),
            StringComparer.OrdinalIgnoreCase);

        var referenceTargets = await LoadReferenceTargetsAsync(documents);
        var seenSchemaNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < documents.Count; i++)
        {
            var doc = documents[i];
            var prefix = $"Document[{i}]";

            if (string.IsNullOrWhiteSpace(doc.SchemaName))
            {
                errors.Add($"{prefix}: SchemaName is required.");
            }
            else
            {
                if (!seenSchemaNames.Add(doc.SchemaName))
                    errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' is used by more than one document in this import file. Schema names must be unique.");

                if (doc.SchemaName.Length > 50)
                    errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' must be between 1 and 50 characters.");
                else if (!SchemaValidatorHelper.NameAllowedPattern.IsMatch(doc.SchemaName))
                    errors.Add($"{prefix}: SchemaName '{doc.SchemaName}' may only contain letters, numbers, and underscore, and cannot start with a number.");
            }

            if (!Enum.IsDefined(doc.SchemaType))
                errors.Add($"{prefix}: SchemaType '{doc.SchemaType}' is not a valid value.");

            if (!Enum.IsDefined(doc.ReadAccessLevel))
                errors.Add($"{prefix}: ReadAccessLevel '{doc.ReadAccessLevel}' is not a valid value.");
            if (!Enum.IsDefined(doc.WriteAccessLevel))
                errors.Add($"{prefix}: WriteAccessLevel '{doc.WriteAccessLevel}' is not a valid value.");
            if (!Enum.IsDefined(doc.EditAccessLevel))
                errors.Add($"{prefix}: EditAccessLevel '{doc.EditAccessLevel}' is not a valid value.");
            if (!Enum.IsDefined(doc.DeleteAccessLevel))
                errors.Add($"{prefix}: DeleteAccessLevel '{doc.DeleteAccessLevel}' is not a valid value.");

            if (!SchemaValidatorHelper.DoesNotEmptyCollectionName(doc.CollectionName, doc.SchemaType))
            {
                errors.Add($"{prefix}: CollectionName is required for an Entity schema.");
            }
            else if (doc.SchemaType == SchemaType.Entity)
            {
                if (!SchemaValidatorHelper.IsValidCollectionNameLength(doc.CollectionName, doc.SchemaType))
                    errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' must be between 1 and 50 characters.");
                else if (!SchemaValidatorHelper.IsAllowedCollectionName(doc.CollectionName, doc.SchemaType))
                    errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' may only contain letters, numbers, and underscore, and cannot start with a number.");
                if (systemCollectionNames.Contains(doc.CollectionName.Trim()))
                    errors.Add($"{prefix}: CollectionName '{doc.CollectionName}' is reserved by a system entity.");
            }

            if (doc.Fields == null || doc.Fields.Count == 0)
                errors.Add($"{prefix}: At least one field is required.");

            foreach (var policy in doc.RowLevelPolicies ?? [])
            {
                ValidateAccessPolicy(policy, $"{prefix}.RowLevelPolicy[{policy.PolicyName}]", errors);
            }

            var seenFieldNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in doc.Fields ?? [])
            {
                if (string.IsNullOrWhiteSpace(field.Name))
                {
                    errors.Add($"{prefix}: A field is missing a Name.");
                }
                else
                {
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

                if (string.IsNullOrWhiteSpace(field.Type))
                {
                    errors.Add($"{prefix}.{field.Name}: Field Type is required.");
                }
                else if (!GraphQlTypeHelper.IsScalar(field.Type) &&
                         !schemaNamesInBatch.Contains(field.Type) &&
                         !existingCustomSchemaNames.Contains(field.Type))
                {
                    errors.Add(
                        $"{prefix}.{field.Name}: Type '{field.Type}' is not a supported field type." +
                        $"{GetTypeSuggestionHint(field.Type)} Supported types are String, Int, Float, " +
                        "Boolean, DateTime, ID, or the name of another schema in this import (for nested/custom object fields).");
                }

                if (!Enum.IsDefined(field.ReadAccessLevel))
                    errors.Add($"{prefix}.{field.Name}: ReadAccessLevel '{field.ReadAccessLevel}' is not a valid value.");
                if (!Enum.IsDefined(field.WriteAccessLevel))
                    errors.Add($"{prefix}.{field.Name}: WriteAccessLevel '{field.WriteAccessLevel}' is not a valid value.");
                if (!Enum.IsDefined(field.EditAccessLevel))
                    errors.Add($"{prefix}.{field.Name}: EditAccessLevel '{field.EditAccessLevel}' is not a valid value.");
                if (!Enum.IsDefined(field.DeleteAccessLevel))
                    errors.Add($"{prefix}.{field.Name}: DeleteAccessLevel '{field.DeleteAccessLevel}' is not a valid value.");

                if (field.AccessPolicies != null)
                {
                    foreach (var policy in field.AccessPolicies)
                    {
                        ValidateAccessPolicy(policy, $"{prefix}.{field.Name}.Policy[{policy.PolicyName}]", errors);
                    }
                }

                if (field.ValidationRules != null)
                {
                    foreach (var rule in field.ValidationRules)
                    {
                        if (!Enum.IsDefined(rule.Type))
                        {
                            errors.Add($"{prefix}.{field.Name}: ValidationType '{rule.Type}' is not a valid value.");
                            continue;
                        }

                        if (rule.Value is null && rule.Type != ValidationType.NotEmpty)
                            errors.Add($"{prefix}.{field.Name}: Value is required for validation type '{rule.Type}'.");

                        if (rule.SecondaryValue is null && rule.Type is ValidationType.Range or ValidationType.LengthRange)
                            errors.Add($"{prefix}.{field.Name}: SecondaryValue is required for validation type '{rule.Type}'.");
                    }
                    ValidateReferenceRules(field, referenceTargets, $"{prefix}.{field.Name}", errors);
                }
            }
        }

        return errors;
    }

    /// <summary>
    /// Reference rules point at a schema by name: it must be an Entity in this import file or already in the
    /// project, with a matching single-value target field (the same checks as the validation API).
    /// </summary>
    private static void ValidateReferenceRules(
        ExportFieldDefinition field,
        IReadOnlyDictionary<string, SchemaDefinition> targets,
        string prefix,
        List<string> errors)
    {
        var references = (field.ValidationRules ?? []).Where(r => r.Type == ValidationType.Reference).ToList();
        if (references.Count == 0)
            return;
        if (references.Count > 1)
        {
            errors.Add($"{prefix}: {ReferenceRuleCompatibility.OnlyOneReference}");
            return;
        }

        var rule = new ValidationRule { Type = ValidationType.Reference, Value = references[0].Value, SecondaryValue = references[0].SecondaryValue };
        var targetName = ReferenceTargets.TargetSchemaName(rule);
        var source = new FieldDefinition { Name = field.Name, Type = field.Type, IsArray = field.IsArray };
        var problem = ReferenceRuleCompatibility.Check(source, targets.GetValueOrDefault(targetName), ReferenceTargets.TargetFieldName(rule));
        if (problem is not null)
            errors.Add($"{prefix}: Reference to '{targetName}.{ReferenceTargets.TargetFieldName(rule)}' is not valid ({problem})");
    }

    /// <summary>Schemas that Reference rules in <paramref name="documents"/> may point at: the file's own, then the project's.</summary>
    private async Task<Dictionary<string, SchemaDefinition>> LoadReferenceTargetsAsync(List<SchemaExportDocument> documents)
    {
        var targets = new Dictionary<string, SchemaDefinition>(StringComparer.Ordinal);
        var names = documents
            .SelectMany(d => d.Fields ?? [])
            .SelectMany(f => f.ValidationRules ?? [])
            .Where(r => r.Type == ValidationType.Reference)
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
            foreach (var schema in existing ?? [])
                targets.TryAdd(schema.SchemaName, schema);
        }
        return targets;
    }

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
