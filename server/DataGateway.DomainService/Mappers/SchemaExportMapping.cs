using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;

namespace DataGateway.DomainService.Mappers;

public static class SchemaExportMapping
{
    public static List<SchemaExportDocument> MapToExportDocuments(
        this List<SchemaDefinition> schemas,
        List<DataAccessPolicy> allPolicies,
        List<DataValidation> allValidations,
        SchemaExportOption exportOption)
    {
        var rlsBySchema = allPolicies
            .Where(p => p.PolicyType == PolicyType.RLS)
            .GroupBy(p => p.SchemaName)
            .ToDictionary(g => g.Key, g => g.ToList());

        var clsBySchemaField = allPolicies
            .Where(p => p.PolicyType == PolicyType.CLS)
            .SelectMany(p => p.FieldNames.Select(f => (SchemaName: p.SchemaName, FieldName: f, Policy: p)))
            .GroupBy(x => (x.SchemaName, x.FieldName))
            .ToDictionary(g => g.Key, g => g.Select(x => x.Policy).ToList());

        var validationsByField = allValidations
            .GroupBy(v => (v.SchemaId, v.FieldName))
            .ToDictionary(g => g.Key, g => g.SelectMany(v => v.Validations).ToList());

        var result = new List<SchemaExportDocument>();

        foreach (var schema in schemas)
        {
            var doc = new SchemaExportDocument
            {
                CollectionName = schema.CollectionName,
                SchemaName = schema.SchemaName,
                SchemaType = schema.SchemaType,
                ReadAccessLevel = schema.ReadAccessLevel,
                WriteAccessLevel = schema.WriteAccessLevel,
                EditAccessLevel = schema.EditAccessLevel,
                DeleteAccessLevel = schema.DeleteAccessLevel,
                RowLevelPolicies = rlsBySchema.TryGetValue(schema.SchemaName, out var rlsPolicies)
                    ? rlsPolicies.Select(MapToExportAccessPolicy).ToList()
                    : new()
            };

            foreach (var field in schema.Fields)
            {
                var fieldName = field.Name;
                var exportField = new ExportFieldDefinition
                {
                    Name = fieldName,
                    Type = field.Type,
                    IsArray = field.IsArray,
                    IsPIIData = field.IsPIIData,
                    IsUniqueData = field.IsUniqueData,
                    RequiredOn = field.RequiredOn,
                    Description = field.Description,
                    IsReferenceField = field.IsReferenceField,
                    ReadAccessLevel = field.ReadAccessLevel,
                    WriteAccessLevel = field.WriteAccessLevel,
                    EditAccessLevel = field.EditAccessLevel,
                    DeleteAccessLevel = field.DeleteAccessLevel
                };

                if (exportOption.HasFlag(SchemaExportOption.AccessPolicies))
                {
                    exportField.AccessPolicies = clsBySchemaField.TryGetValue((schema.SchemaName, fieldName), out var clsPolicies)
                        ? clsPolicies.Select(MapToExportAccessPolicy).ToList()
                        : new();
                }

                if (exportOption.HasFlag(SchemaExportOption.ValidationRules))
                {
                    exportField.ValidationRules = validationsByField.TryGetValue((schema.ItemId, fieldName), out var validations)
                        ? validations.Select(MapToExportValidationRule).ToList()
                        : new();
                }

                doc.Fields.Add(exportField);
            }

            result.Add(doc);
        }

        return result;
    }

    public static ExportAccessPolicy MapToExportAccessPolicy(this DataAccessPolicy policy) => new()
    {
        PolicyName = policy.PolicyName,
        PolicyDescription = policy.PolicyDescription,
        PolicyType = policy.PolicyType,
        Operation = policy.Operation,
        RuleGroup = policy.RuleGroup,
        Priority = policy.Priority,
        IsAllowPolicy = policy.IsAllowPolicy
    };

    public static ExportValidationRule MapToExportValidationRule(this ValidationRule rule) => new()
    {
        Type = rule.Type,
        Value = rule.Value,
        SecondaryValue = rule.SecondaryValue,
        ErrorMessage = rule.ErrorMessage,
        IsActive = rule.IsActive
    };
}
