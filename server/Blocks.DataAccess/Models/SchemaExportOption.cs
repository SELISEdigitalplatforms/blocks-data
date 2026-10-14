namespace Blocks.DataAccess.Models;

[Flags]
public enum SchemaExportOption
{
    Schema = 0,            // schema structure + access levels (Read/Write/Edit/Delete) from SchemaDefinition
    AccessPolicies = 1,  // additionally include RLS and CLS policies from DataAccessPolicy
    ValidationRules = 2, // additionally include per-field validation rules
    All = AccessPolicies | ValidationRules
}
