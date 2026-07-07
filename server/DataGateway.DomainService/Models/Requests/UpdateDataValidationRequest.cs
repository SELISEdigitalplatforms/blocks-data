using Blocks.Genesis;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models;

/// <summary>
/// Request model for updating a data validation
/// </summary>
public class UpdateDataValidationRequest
{
    /// <summary>
    /// The unique identifier of the validation to update
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
    public List<ValidationRuleRequest> Validations { get; set; } = new List<ValidationRuleRequest>();
}
