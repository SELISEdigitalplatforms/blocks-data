using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;

namespace DataGateway.DomainService.Mappers;

public static class SchemaImportMapping
{
    public static SchemaDefinition MapToSchemaDefinition(this SchemaExportDocument doc) => new()
    {
        CollectionName = doc.CollectionName,
        SchemaName = doc.SchemaName,
        SchemaType = doc.SchemaType,
        ReadAccessLevel = doc.ReadAccessLevel,
        WriteAccessLevel = doc.WriteAccessLevel,
        EditAccessLevel = doc.EditAccessLevel,
        DeleteAccessLevel = doc.DeleteAccessLevel,
        Fields = doc.Fields.Select(MapToFieldDefinition).ToList()
    };

    public static FieldDefinition MapToFieldDefinition(this ExportFieldDefinition f) => new()
    {
        Name = f.Name,
        Type = f.Type,
        IsArray = f.IsArray,
        IsPIIData = f.IsPIIData,
        IsUniqueData = f.IsUniqueData,
        Description = f.Description,
        IsReferenceField = f.IsReferenceField,
        ReferenceFieldType = f.ReferenceFieldType,
        ReadAccessLevel = f.ReadAccessLevel,
        WriteAccessLevel = f.WriteAccessLevel,
        EditAccessLevel = f.EditAccessLevel,
        DeleteAccessLevel = f.DeleteAccessLevel
    };

    /// <summary>
    /// Maps an RLS export policy to a DataAccessPolicy entity for the given schema.
    /// </summary>
    public static DataAccessPolicy MapToRlsPolicy(this ExportAccessPolicy rls, string schemaId, string schemaName) => new()
    {
        PolicyName = rls.PolicyName,
        PolicyDescription = rls.PolicyDescription,
        PolicyType = PolicyType.RLS,
        Operation = rls.Operation,
        SchemaName = schemaName,
        SchemaId = schemaId,
        FieldNames = [],
        RuleGroup = rls.RuleGroup,
        Priority = rls.Priority,
        IsAllowPolicy = rls.IsAllowPolicy
    };

    /// <summary>
    /// Maps a CLS export policy to a DataAccessPolicy entity, attaching the reconstructed FieldNames.
    /// </summary>
    public static DataAccessPolicy MapToClsPolicy(this ExportAccessPolicy cls, string schemaId, string schemaName, string[] fieldNames) => new()
    {
        PolicyName = cls.PolicyName,
        PolicyDescription = cls.PolicyDescription,
        PolicyType = PolicyType.CLS,
        Operation = cls.Operation,
        SchemaName = schemaName,
        SchemaId = schemaId,
        FieldNames = fieldNames,
        RuleGroup = cls.RuleGroup,
        Priority = cls.Priority,
        IsAllowPolicy = cls.IsAllowPolicy
    };

    /// <summary>
    /// Reconstructs CLS DataAccessPolicy entities from per-field AccessPolicies in the export document.
    /// Groups by PolicyName to recover the original FieldNames list.
    /// </summary>
    public static List<DataAccessPolicy> MapToClsPolicies(this SchemaExportDocument doc, string schemaId, string schemaName)
    {
        var clsByPolicyName = new Dictionary<string, (ExportAccessPolicy Policy, List<string> FieldNames)>(StringComparer.OrdinalIgnoreCase);

        foreach (var field in doc.Fields.Where(f => f.AccessPolicies != null))
        {
            foreach (var cls in field.AccessPolicies!)
            {
                if (!clsByPolicyName.TryGetValue(cls.PolicyName, out var entry))
                    clsByPolicyName[cls.PolicyName] = (cls, [field.Name]);
                else
                    entry.FieldNames.Add(field.Name);
            }
        }

        return clsByPolicyName
            .Values
            .Select(e => e.Policy.MapToClsPolicy(schemaId, schemaName, [.. e.FieldNames]))
            .ToList();
    }

    public static ValidationRule MapToValidationRule(this ExportValidationRule r) => new()
    {
        Type = r.Type,
        Value = JsonValueHelper.ToStorableValue(r.Value),
        SecondaryValue = JsonValueHelper.ToStorableValue(r.SecondaryValue),
        ErrorMessage = r.ErrorMessage,
        IsActive = r.IsActive
    };
}
