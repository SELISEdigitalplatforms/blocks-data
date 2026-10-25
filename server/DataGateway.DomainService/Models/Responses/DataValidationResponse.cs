using System.Text.Json.Serialization;
using DataGateway.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models.Responses;

/// <summary>
/// Response model for data validation
/// </summary>
public class DataValidationResponse
{
    /// <summary>
    /// Unique identifier
    /// </summary>
    public string ItemId { get; set; } = string.Empty;

    /// <summary>
    /// The schema ID this validation belongs to
    /// </summary>
    public string SchemaId { get; set; } = string.Empty;

    /// <summary>
    /// The field name being validated
    /// </summary>
    public string FieldName { get; set; } = string.Empty;

    /// <summary>
    /// List of validation rules
    /// </summary>
    public List<ValidationRuleResponse> Validations { get; set; } = new List<ValidationRuleResponse>();

    /// <summary>
    /// Created date
    /// </summary>
    public DateTime CreatedDate { get; set; }

    /// <summary>
    /// Last updated date
    /// </summary>
    public DateTime LastUpdatedDate { get; set; }
}

/// <summary>
/// Response model for a validation rule
/// </summary>
public class ValidationRuleResponse
{
    /// <summary>
    /// Type of validation
    /// </summary>
    public ValidationType Type { get; set; }

    /// <summary>
    /// The value to validate against
    /// </summary>
    public object? Value { get; set; }

    /// <summary>
    /// Secondary value for range validations
    /// </summary>
    public object? SecondaryValue { get; set; }

    /// <summary>
    /// Custom error message
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Whether this validation is active
    /// </summary>
    public bool IsActive { get; set; }

    /// <summary>0: rules as they always were; 1: list properties are checked item by item.</summary>
    public int EvaluationVersion { get; set; }

    /// <summary>The rule applies only when this condition holds. Left out when the rule has none.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PolicyRuleGroup? When { get; set; }

    /// <summary>The target row must also match this condition. Left out when the rule has none.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PolicyRuleGroup? TargetFilter { get; set; }
}
