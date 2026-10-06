using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using HotChocolate.Language;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

public class EntityFilterInputType : InputObjectType
{
    private readonly SchemaDefinitionExtended _schema;

    public EntityFilterInputType(SchemaDefinitionExtended schema)
    {
        _schema = schema;
    }

    protected override void Configure(IInputObjectTypeDescriptor descriptor)
    {
        var schemaName = _schema.GetSchemaNameForProject();
        var filterTypeName = $"{schemaName}FilterInput";
        descriptor.Name(filterTypeName);
        descriptor.Description($"Filter input for {schemaName}.");

        foreach (var field in _schema.Fields)
        {
            if (!GraphQlTypeHelper.IsScalar(field.Type))
                continue;

            var operationFilterTypeName = field.Type == GraphQlTypeHelper.EnumTypeName
                ? GraphQlTypeHelper.GetEnumOperationFilterTypeName(schemaName, field.Name)
                : GetOperationFilterTypeName(field.Type);
            descriptor.Field(field.Name)
                .Type(new NamedTypeNode(operationFilterTypeName))
                .Description($"Filter by {field.Name}.");
        }

        foreach (var field in _schema.Fields.Where(f => !GraphQlTypeHelper.IsScalar(f.Type) && f.Fields.Count > 0))
        {
            descriptor.Field(field.Name)
                .Type(new NamedTypeNode($"{field.Type}FilterInput"))
                .Description($"Filter by fields inside {field.Name}.");
        }

        descriptor.Field("or")
            .Type(new ListTypeNode(new NonNullTypeNode(new NamedTypeNode(filterTypeName))))
            .Description("Logical OR of conditions.");
        descriptor.Field("and")
            .Type(new ListTypeNode(new NonNullTypeNode(new NamedTypeNode(filterTypeName))))
            .Description("Logical AND of conditions.");
    }

    internal static string GetOperationFilterTypeName(string scalarType)
    {
        return scalarType switch
        {
            "String" or "ID" => "StringOperationFilterInput",
            "Int" => "IntOperationFilterInput",
            "Float" => "NumberOperationFilterInput",
            "Boolean" => "BooleanOperationFilterInput",
            "DateTime" => "DateTimeOperationFilterInput",
            GeoJsonValidator.TypeName => "GeoJsonOperationFilterInput",
            _ => "StringOperationFilterInput"
        };
    }
}

/// <summary>A reusable filter input for an embedded DTO schema.</summary>
public sealed class ChildSchemaFilterInputType(string schemaTypeName, IReadOnlyList<FieldDefinitionResponse> fields)
    : InputObjectType
{
    protected override void Configure(IInputObjectTypeDescriptor descriptor)
    {
        descriptor.Name($"{schemaTypeName}FilterInput");
        descriptor.Description($"Filter input for embedded {schemaTypeName} values.");

        foreach (var field in fields.Where(f => GraphQlTypeHelper.IsScalar(f.Type) || f.Fields.Count > 0))
        {
            string typeName;
            if (field.Type == GraphQlTypeHelper.EnumTypeName)
                typeName = GraphQlTypeHelper.GetEnumOperationFilterTypeName(schemaTypeName, field.Name);
            else if (GraphQlTypeHelper.IsScalar(field.Type))
                typeName = EntityFilterInputType.GetOperationFilterTypeName(field.Type);
            else
                typeName = $"{field.Type}FilterInput";
            descriptor.Field(field.Name)
                .Type(new NamedTypeNode(typeName))
                .Description($"Filter by {field.Name}.");
        }
    }
}
