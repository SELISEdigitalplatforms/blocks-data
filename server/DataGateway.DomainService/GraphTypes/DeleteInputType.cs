

using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.GraphTypes;

public class DeleteInputType : InputObjectType
{
    private readonly SchemaDefinition _schema;

    public DeleteInputType(SchemaDefinition schema)
    {
        _schema = schema;
    }

    protected override void Configure(IInputObjectTypeDescriptor descriptor)
    {
        var schemaName = _schema.GetSchemaNameForProject();
        descriptor.Name(schemaName + "DeleteInput");
        descriptor.Field(GraphQlConstant.HardDeleteFieldName)
            .Type<NonNullType<BooleanType>>()
            .Description("Indicates whether to perform a hard delete (true) or soft delete (false).");
    }
}
