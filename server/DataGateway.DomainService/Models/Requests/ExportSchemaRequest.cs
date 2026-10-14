using Blocks.DataAccess.Models;
using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ExportSchemaRequest
{
    public string? MessageCoRelationId { get; set; }
    public SchemaExportOption ExportOption { get; set; }
}
