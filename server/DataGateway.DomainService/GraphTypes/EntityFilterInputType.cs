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

            var operationFilterTypeName = GetOperationFilterTypeName(field.Type);
            descriptor.Field(field.Name)
                .Type(new NamedTypeNode(operationFilterTypeName))
                .Description($"Filter by {field.Name}.");
        }

        descriptor.Field("or")
            .Type(new ListTypeNode(new NamedTypeNode(filterTypeName)))
            .Description("Logical OR of conditions.");
        descriptor.Field("and")
            .Type(new ListTypeNode(new NamedTypeNode(filterTypeName)))
            .Description("Logical AND of conditions.");
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
