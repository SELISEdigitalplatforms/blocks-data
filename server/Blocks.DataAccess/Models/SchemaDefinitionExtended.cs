using Blocks.DataAccess.Entities;

namespace Blocks.DataAccess.Models;

public class SchemaDefinitionExtended : SchemaDefinition
{
    public new List<FieldDefinitionResponse> Fields { get; set; } = [];
    public List<DataAccessPolicy> Policies { get; set; } = [];
}
