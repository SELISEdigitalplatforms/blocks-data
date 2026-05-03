using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

/// <summary>
/// Request model for getting a list of data validations with pagination
/// </summary>
public class GetDataValidationListRequest : BasePaginationRequest
{
    /// <summary>
    /// Filter by schema ID
    /// </summary>
    public string? SchemaId { get; set; }

    /// <summary>
    /// Filter by field name
    /// </summary>
    public string? FieldName { get; set; }

    /// <summary>
    /// Search keyword
    /// </summary>
    public string? Keyword { get; set; }

    /// <summary>
    /// Project key for context
    /// </summary>
    public string ProjectKey { get; set; } = string.Empty;
}
