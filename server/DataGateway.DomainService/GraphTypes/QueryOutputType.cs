using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;

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
            if (GraphQlTypeHelper.IsScalar(field.Type))
            {
                descriptor.Field(field.Name)
                    .Type(GraphQlTypeHelper.GetTypeNode(field.Type, field.IsArray))
                    .Resolve(ctx =>
                    {
                        var parent = ctx.Parent<object>();
                        if (parent is IDictionary<string, object> dict)
                        {
                            if (field.Name == nameof(GraphQlBaseEntity.ItemId)
                            && dict.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var idValue))
                            {
                                return idValue;
                            }
                            return dict.TryGetValue(field.Name, out var value) ? value : null;
                        }
                        return null;
                    });
            }
            else if (_schemaMap.TryGetValue(field.Type, out _))
            {
                ((IObjectTypeDescriptor)descriptor).ResolveCustomObjectTypeField(field);
            }
        }
    }
}
