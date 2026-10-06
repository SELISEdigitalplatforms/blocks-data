using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Language;

namespace DataGateway.DomainService.GraphTypes;

public class QueryOutputType : ObjectType<object>
{
    private readonly SchemaDefinitionExtended _schema;
    private readonly Dictionary<string, SchemaDefinitionExtended> _schemaMap;

    public QueryOutputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
    {
        _schema = schema;
        _schemaMap = schemaMap;
    }

    protected override void Configure(IObjectTypeDescriptor<object> descriptor)
    {
        var schemaName = _schema.GetSchemaNameForProject();
        descriptor.Name(schemaName);

        foreach (var field in _schema.Fields)
        {
            ConfigureField(descriptor, schemaName, field);
        }
    }

    private void ConfigureField(IObjectTypeDescriptor<object> descriptor, string schemaName, FieldDefinitionResponse field)
    {
        if (GraphQlTypeHelper.IsScalar(field.Type))
        {
            ConfigureScalarField(descriptor, schemaName, field);
            return;
        }

        if (_schemaMap.TryGetValue(field.Type, out _))
        {
            ((IObjectTypeDescriptor)descriptor).ResolveCustomObjectTypeField(field);
        }
    }

    private static void ConfigureScalarField(
        IObjectTypeDescriptor<object> descriptor,
        string schemaName,
        FieldDefinitionResponse field)
    {
        var typeNode = ResolveScalarTypeNode(schemaName, field);
        descriptor.Field(field.Name)
            .Type(typeNode)
            .Resolve(ctx => ResolveParentFieldValue(ctx.Parent<object>(), field.Name));
    }

    private static ITypeNode ResolveScalarTypeNode(string schemaName, FieldDefinitionResponse field)
    {
        return field.Type == GraphQlTypeHelper.EnumTypeName
            ? GraphQlTypeHelper.GetEnumTypeNode(schemaName, field.Name, field.IsArray)
            : GraphQlTypeHelper.GetTypeNode(field.Type, field.IsArray);
    }

    private static object? ResolveParentFieldValue(object parent, string fieldName)
    {
        if (parent is not IDictionary<string, object> dict)
        {
            return null;
        }

        if (fieldName == nameof(GraphQlBaseEntity.ItemId)
            && dict.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var idValue))
        {
            return idValue;
        }

        return dict.TryGetValue(fieldName, out var value) ? value : null;
    }
}
