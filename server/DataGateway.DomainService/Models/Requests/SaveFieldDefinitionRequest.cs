using System;
using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class SaveFieldDefinitionRequest
{
    public string SchemaDefinitionItemId { get; set; } = string.Empty;
    public string[] DeletableFieldNames { get; set; } = [];
    public List<FieldDefinitionRequest> Fields { get; set; } = [];
}
