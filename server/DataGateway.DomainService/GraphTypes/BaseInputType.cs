using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using HotChocolate.Language;

namespace DataGateway.DomainService.GraphTypes;

public abstract class BaseInputType : InputObjectType<object>
{
    protected readonly SchemaDefinitionExtended _schema;
    protected readonly Dictionary<string, SchemaDefinitionExtended> _schemaMap;

    protected abstract string NameSuffix { get; }
    protected abstract string[] AllowedBaseFields { get; }

    protected BaseInputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
    {
        _schema = schema;
        _schemaMap = schemaMap;
    }

    protected override void Configure(IInputObjectTypeDescriptor<object> descriptor)
    {
        var schemaName = _schema.GetSchemaNameForProject();
        descriptor.Name($"{schemaName}{NameSuffix}");

        foreach (var field in _schema.Fields)
        {
            var fieldType = field.Type;
            var fieldName = field.Name;

            if (!AllowedBaseFields.Contains(fieldName)
                && typeof(GraphQlBaseEntity).GetProperty(fieldName) is not null)
            {
                continue;
            }

            if (GraphQlTypeHelper.IsScalar(fieldType))
            {
                var inputType = GraphQlTypeHelper.GetTypeNode(fieldType, field.IsArray);
                descriptor.Field(fieldName).Type(inputType);
            }
            else if (_schemaMap.TryGetValue(fieldType, out _))
            {
                if (field.IsArray)
                {
                    var itemType = GraphQlTypeHelper.GetCustomTypeNode($"{field.Type}Input");
                    descriptor.Field(fieldName).Type(new ListTypeNode(itemType));
                }
                else
                {
                    descriptor.Field(fieldName).Type(GraphQlTypeHelper.GetCustomTypeNode($"{field.Type}Input"));
                }
            }
        }
    }
}
