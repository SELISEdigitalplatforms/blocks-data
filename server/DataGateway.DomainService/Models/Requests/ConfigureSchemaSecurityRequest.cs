using System;
using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ConfigureSchemaSecurityRequest
{
    public string SchemaId { get; set; } = string.Empty;
    public PolicyOperation Operation { get; set; }
    public PolicyType PolicyType { get; set; }
    public string[] FieldNames { get; set; } = [];
    public SchemaAccessLevel AccessLevel { get; set; }
}
