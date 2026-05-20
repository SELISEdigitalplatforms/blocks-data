using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ExportSchemaRequest : IProjectKey
{
    public required string ProjectKey { get; set; }
    public string? MessageCoRelationId { get; set; }
    public SchemaExportOption ExportOption { get; set; }
}

[Flags]
public enum SchemaExportOption
{
    Schema = 0,            // schema structure + access levels (Read/Write/Edit/Delete) from SchemaDefinition
    AccessPolicies = 1,  // additionally include RLS and CLS policies from DataAccessPolicy
    ValidationRules = 2, // additionally include per-field validation rules
    All = AccessPolicies | ValidationRules
}
