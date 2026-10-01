using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Language;

namespace DataGateway.DomainService.Helpers;

public static class DescriptorHelper
{
    public static void ResolveObjectTypeDescriptor(this IObjectTypeDescriptor descriptor, FieldDefinitionResponse field, string schemaName)
    {
        if (GraphQlTypeHelper.IsScalar(field.Type))
        {
            BindField(descriptor, field, ResolveScalarTypeNode(schemaName, field));
            return;
        }

        BindField(descriptor, field, GraphQlTypeHelper.GetCustomTypeNode(field.Type, field.IsArray));
    }

    private static ITypeNode ResolveScalarTypeNode(string schemaName, FieldDefinitionResponse field)
    {
        return field.Type == GraphQlTypeHelper.EnumTypeName
            ? GraphQlTypeHelper.GetEnumTypeNode(schemaName, field.Name, field.IsArray)
            : GraphQlTypeHelper.GetTypeNode(field.Type, field.IsArray);
    }

    private static void BindField(IObjectTypeDescriptor descriptor, FieldDefinitionResponse field, ITypeNode typeNode)
    {
        var fieldName = field.Name;
        descriptor.Field(fieldName).Description(field.Description ?? string.Empty)
            .Type(typeNode)
            .Resolve(ctx => ResolveDictValue(ctx.Parent<object>(), fieldName));
    }

    private static object? ResolveDictValue(object parent, string fieldName)
    {
        if (parent is IDictionary<string, object> dict)
        {
            return dict.TryGetValue(fieldName, out var value) ? value : null;
        }

        return null;
    }

    public static void ResolveCustomObjectTypeField(this IObjectTypeDescriptor descriptor, FieldDefinitionResponse field)
    {
        if (field.IsArray)
        {
            descriptor.Field(field.Name).Description(field.Description ?? string.Empty)
                .Type(GraphQlTypeHelper.GetCustomTypeNode(field.Type, true))
                .Resolve(ctx =>
                {
                    var parent = ctx.Parent<object>();
                    if (parent is IDictionary<string, object> dict)
                    {
                        return dict.TryGetValue(field.Name, out var value) ? value : null;
                    }
                    return null;
                });
        }
        else
        {
            descriptor.Field(field.Name).Description(field.Description ?? string.Empty)
                .Type(GraphQlTypeHelper.GetCustomTypeNode(field.Type))
                .Resolve(ctx => ResolveDictValue(ctx.Parent<object>(), field.Name));
        }
    }

    public static void ResolveInputTypeDescriptor(this IInputObjectTypeDescriptor descriptor, FieldDefinitionResponse field, string schemaName)
    {
        var fieldType = field.Type;
        var fieldName = field.Name;

        if (GraphQlTypeHelper.IsScalar(fieldType))
        {
            var inputType = fieldType == GraphQlTypeHelper.EnumTypeName
                ? GraphQlTypeHelper.GetEnumTypeNode(schemaName, fieldName, field.IsArray)
                : GraphQlTypeHelper.GetTypeNode(fieldType, field.IsArray);
            descriptor.Field(fieldName).Description(field.Description ?? string.Empty).Type(inputType);
        }
        else if (field.IsArray)
        {
            var innerType = GraphQlTypeHelper.GetCustomTypeNode($"{field.Type}Input");
            descriptor.Field(fieldName).Description(field.Description ?? string.Empty).Type(new ListTypeNode(innerType));
        }
        else
        {
            descriptor.Field(fieldName).Description(field.Description ?? string.Empty).Type(GraphQlTypeHelper.GetCustomTypeNode($"{field.Type}Input"));
        }

    }

}
