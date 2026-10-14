using DataGateway.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

public class SchemaDefinitionExtended : SchemaDefinition
{
    public new List<FieldDefinitionResponse> Fields { get; set; } = [];
    public List<DataAccessPolicy> Policies { get; set; } = [];
}
