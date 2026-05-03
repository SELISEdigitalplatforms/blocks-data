using System;
using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class SaveFieldDefinitionRequest : IProjectKey
{
    public string SchemaDefinitionItemId { get; set; } = string.Empty;
    public string[] DeletableFieldNames { get; set; } = [];
    public string ProjectShortKey { get; set; } = string.Empty;
    public List<FieldDefinitionRequest> Fields { get; set; } = [];
    public string ProjectKey { get; set; } = string.Empty;
}
