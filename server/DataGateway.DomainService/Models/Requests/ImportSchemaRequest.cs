using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ImportSchemaRequest
{
    public required string FileId { get; set; }
    public string? MessageCoRelationId { get; set; }
}
