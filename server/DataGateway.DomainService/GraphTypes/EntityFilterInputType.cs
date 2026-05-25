using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using HotChocolate.Language;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// Dynamically built GraphQL input type for entity filter (e.g. StudentFilterInput).
/// One field per schema scalar field, each of the appropriate operation filter type.
/// </summary>
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
        descriptor.Name($"{schemaName}FilterInput");
        descriptor.Description($"Filter input for {schemaName}.");

        foreach (var field in _schema.Fields)
        {
            if (!GraphQlTypeHelper.IsScalar(field.Type))
                continue;

            var operationFilterTypeName = GetOperationFilterTypeName(field.Type);
            descriptor.Field(field.Name)
                .Type(new NamedTypeNode(operationFilterTypeName))
                .Description($"Filter by {field.Name}.");
        }
    }

    private static string GetOperationFilterTypeName(string scalarType)
    {
        return scalarType switch
        {
            "String" or "ID" => "StringOperationFilterInput",
            "Int" => "IntOperationFilterInput",
            "Float" => "NumberOperationFilterInput",
            "Boolean" => "BooleanOperationFilterInput",
            "DateTime" => "DateTimeOperationFilterInput",
            _ => "StringOperationFilterInput"
        };
    }
}
