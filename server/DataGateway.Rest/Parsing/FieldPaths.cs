using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Field names as a REST request uses them in <c>where</c>, <c>order</c> and <c>select</c>. Names match the schema
/// case-sensitively: the store matches field names exactly, so a differently cased name would otherwise filter,
/// sort or project on nothing. When only the casing is wrong, the error suggests the schema's name.
/// </summary>
internal static class FieldPaths
{
    public const string UnknownFieldType = "UnknownField";
    public const string InvalidValueType = "InvalidValue";
    public const string InvalidKeyType = "InvalidKey";
    public const string UnknownOperatorType = "UnknownOperator";

    public static FieldDefinitionResponse? Find(IEnumerable<FieldDefinitionResponse> fields, string name)
        => fields.FirstOrDefault(f => string.Equals(f.Name, name, StringComparison.Ordinal));

    public static FieldDefinitionResponse? FindIgnoringCase(IEnumerable<FieldDefinitionResponse> fields, string name)
        => fields.FirstOrDefault(f => string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase));

    public static string Join(string prefix, string name) => prefix.Length == 0 ? name : $"{prefix}.{name}";

    /// <summary>"Unknown field 'email'. Did you mean 'Email'?", as a field error on the path the request used.</summary>
    public static RestRequestException UnknownField(string path, string? suggestion)
    {
        var message = suggestion is null || suggestion == path
            ? $"Unknown field '{path}'."
            : $"Unknown field '{path}'. Did you mean '{suggestion}'?";
        return RestRequestException.ForField(path, message, UnknownFieldType);
    }

    /// <summary>
    /// The fields inside a DTO field: those the assembled entity carries inline, otherwise the DTO's own schema from
    /// <see cref="EntityModel.Dtos"/>. Null for a scalar, or a DTO whose fields are not known.
    /// </summary>
    public static IList<FieldDefinitionResponse>? ChildrenOf(FieldDefinitionResponse field, EntityModel entity)
    {
        if (SchemaTypeHelper.IsScalar(field.Type))
            return null;
        if (field.Fields is { Count: > 0 })
            return field.Fields;
        return entity.Dtos is not null && entity.Dtos.TryGetValue(field.Type, out var dto) && dto.Fields is { Count: > 0 }
            ? dto.Fields
            : null;
    }

    /// <summary>A top-level field of the entity, as <c>order</c> takes it; throws the unknown-field error otherwise.</summary>
    public static string RequireTopLevel(EntityModel entity, string name)
    {
        if (Find(entity.Schema.Fields, name) is not null)
            return name;
        throw UnknownField(name, FindIgnoringCase(entity.Schema.Fields, name)?.Name);
    }

    /// <summary>A dotted path through the entity and its DTOs, as <c>select</c> takes it; throws the unknown-field error otherwise.</summary>
    public static string RequirePath(EntityModel entity, string path)
    {
        if (Resolve(entity, path, StringComparison.Ordinal) is not null)
            return path;
        throw UnknownField(path, Resolve(entity, path, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The schema's spelling of <paramref name="path"/>, matching each segment with <paramref name="comparison"/>; null when it does not resolve.</summary>
    private static string? Resolve(EntityModel entity, string path, StringComparison comparison)
    {
        IList<FieldDefinitionResponse>? current = entity.Schema.Fields;
        var names = new List<string>();
        foreach (var segment in path.Split('.'))
        {
            var field = current?.FirstOrDefault(f => string.Equals(f.Name, segment, comparison));
            if (field is null)
                return null;
            names.Add(field.Name);
            current = ChildrenOf(field, entity);
        }
        return string.Join('.', names);
    }
}
