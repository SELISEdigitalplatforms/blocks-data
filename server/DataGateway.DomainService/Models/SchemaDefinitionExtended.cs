using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models;

public class SchemaDefinitionExtended : SchemaDefinition
{
    public new List<FieldDefinitionResponse> Fields { get; set; } = [];
    public List<DataAccessPolicy> Policies { get; set; } = [];
}
