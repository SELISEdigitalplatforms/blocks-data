using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models.Export;

public class SchemaExportDocument
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
    public SchemaAccessLevel ReadAccessLevel { get; set; }
    public SchemaAccessLevel WriteAccessLevel { get; set; }
    public SchemaAccessLevel EditAccessLevel { get; set; }
    public SchemaAccessLevel DeleteAccessLevel { get; set; }
    /// <summary>RLS (row-level) policies — always included, not tied to a specific field.</summary>
    public List<ExportAccessPolicy> RowLevelPolicies { get; set; } = new();
    public List<ExportFieldDefinition> Fields { get; set; } = new();
}

public class ExportFieldDefinition
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsArray { get; set; }
    public bool IsPIIData { get; set; }
    public bool IsUniqueData { get; set; }
    public RequiredOn RequiredOn { get; set; } = RequiredOn.None;
    public string Description { get; set; } = string.Empty;
    public bool IsReferenceField { get; set; }
    public SchemaAccessLevel ReadAccessLevel { get; set; }
    public SchemaAccessLevel WriteAccessLevel { get; set; }
    public SchemaAccessLevel EditAccessLevel { get; set; }
    public SchemaAccessLevel DeleteAccessLevel { get; set; }
    /// <summary>CLS (column-level) policies covering this field. Null when AccessPolicies flag is not set.</summary>
    public List<ExportAccessPolicy>? AccessPolicies { get; set; }
    /// <summary>Validation rules for this field. Null when ValidationRules flag is not set.</summary>
    public List<ExportValidationRule>? ValidationRules { get; set; }
}

public class ExportAccessPolicy
{
    public string PolicyName { get; set; } = string.Empty;
    public string PolicyDescription { get; set; } = string.Empty;
    public PolicyType PolicyType { get; set; }
    public PolicyOperation Operation { get; set; }
    public PolicyRuleGroup RuleGroup { get; set; } = new();
    public int Priority { get; set; }
    public bool IsAllowPolicy { get; set; }
}

public class ExportValidationRule
{
    public ValidationType Type { get; set; }
    public object? Value { get; set; }
    public object? SecondaryValue { get; set; }
    public string? ErrorMessage { get; set; }
    public bool IsActive { get; set; }
}
