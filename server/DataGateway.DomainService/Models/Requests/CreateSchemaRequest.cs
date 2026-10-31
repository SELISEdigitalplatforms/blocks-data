using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

public class CreateSchemaRequest
{
    public string CollectionName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public SchemaType SchemaType { get; set; }
    /// <summary>
    /// Plain text, at most 500 characters. On update, null keeps the stored description and an empty text removes it.
    /// </summary>
    public string? Description { get; set; }
}