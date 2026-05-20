using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ImportSchemaRequest : IProjectKey
{
    public required string ProjectKey { get; set; }
    public required string FileId { get; set; }
    public string? MessageCoRelationId { get; set; }
}
