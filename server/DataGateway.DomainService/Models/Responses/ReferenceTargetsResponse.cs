using System.Text.Json.Serialization;

namespace DataGateway.DomainService.Models;

/// <summary>
/// The schemas a Reference or Must not exist in rule can point at, for the target picker: the tenant's own entities,
/// then the system entities, each by name and capped per group.
/// </summary>
public class ReferenceTargetsResponse
{
    public List<ReferenceTargetSchema> Entities { get; set; } = [];
    public List<ReferenceTargetSchema> SystemEntities { get; set; } = [];
}

public class ReferenceTargetSchema
{
    public string SchemaName { get; set; } = string.Empty;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }
    public bool IsSystemEntity { get; set; }
    public List<ReferenceTargetField> Fields { get; set; } = [];
}

public class ReferenceTargetField
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsArray { get; set; }
    public bool IsPIIData { get; set; }
    /// <summary>Unique values have an index, so a lookup on the field is fast.</summary>
    public bool IsUniqueData { get; set; }
}
