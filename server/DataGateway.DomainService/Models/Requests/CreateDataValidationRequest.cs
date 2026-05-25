using Blocks.Genesis;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models;

/// <summary>
/// Request model for creating a data validation
/// </summary>
public class CreateDataValidationRequest : ProjectKeyModel
{
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
    public List<ValidationRuleRequest> Validations { get; set; } = new List<ValidationRuleRequest>();
}

/// <summary>
/// Request model for a validation rule
/// </summary>
public class ValidationRuleRequest
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
    public bool IsActive { get; set; } = true;
}
