using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

/// <summary>Sets one property's default value; a null <see cref="DefaultValue"/> clears it.</summary>
public class SetFieldDefaultRequest
{
    public string SchemaId { get; set; } = string.Empty;

    /// <summary>The property's name; a nested property by its full dotted path (e.g. <c>Read.Roles</c>).</summary>
    public string FieldName { get; set; } = string.Empty;

    public FieldDefaultValueRequest? DefaultValue { get; set; }
}

public class FieldDefaultValueRequest
{
    public DefaultValueKind Kind { get; set; }

    /// <summary>Static: a value or a list. Template: a template, or a list of them for a list property.</summary>
    public object? Value { get; set; }

    /// <summary>Now only.</summary>
    public DefaultValueOffset? Offset { get; set; }
}
