using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Language;

namespace DataGateway.DomainService.Helpers;

public static class DescriptorHelper
{
    public static void ResolveObjectTypeDescriptor(this IObjectTypeDescriptor descriptor, FieldDefinitionResponse field)
    {
        if (GraphQlTypeHelper.IsScalar(field.Type))
        {
            descriptor.Field(field.Name).Description(field.Description ?? string.Empty)
                .Type(GraphQlTypeHelper.GetTypeNode(field.Type, field.IsArray))
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
        else if (field.IsArray)
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
                .Resolve(ctx => ((IDictionary<string, object>)ctx.Parent<object>()).TryGetValue(field.Name, out var value) ? value : null);
        }
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
                .Resolve(ctx => ((IDictionary<string, object>)ctx.Parent<object>()).TryGetValue(field.Name, out var value) ? value : null);
        }
    }

    public static void ResolveInputTypeDescriptor(this IInputObjectTypeDescriptor descriptor, FieldDefinitionResponse field)
    {
        var fieldType = field.Type;
        var fieldName = field.Name;

        if (GraphQlTypeHelper.IsScalar(fieldType))
        {
            var inputType = GraphQlTypeHelper.GetTypeNode(fieldType, field.IsArray);
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
