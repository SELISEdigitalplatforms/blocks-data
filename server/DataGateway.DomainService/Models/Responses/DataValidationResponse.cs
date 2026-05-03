using DataGateway.DomainService.Entities;

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
}
