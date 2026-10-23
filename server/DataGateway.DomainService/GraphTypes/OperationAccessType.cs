using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Helpers;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// The base entity's access lists (<c>Create</c>, <c>Read</c>, <c>Update</c>, <c>Delete</c>) as a read-only
/// GraphQL type. Every record carries them, but <see cref="OperationAccess"/> is a platform type rather than one
/// of the project's schemas, so without this type the entity types left them out and they could not be queried.
/// Its fields are the class's own (Roles, UserIds, Permissions), the same ones the schema lists as their inner
/// fields. There is deliberately no input or filter counterpart: these lists decide who may read, update and
/// delete a record, so they are not set or filtered through the gateway.
/// </summary>
public sealed class OperationAccessType : ObjectType
{
    public const string TypeName = nameof(OperationAccess);

    protected override void Configure(IObjectTypeDescriptor descriptor)
    {
        descriptor.Name(TypeName);
        descriptor.Description("Who may perform an operation on the record: roles, users and permissions.");

        foreach (var field in DefaultValueInjection.BaseEntityInnerFields(nameof(BaseEntity.Read), TypeName))
        {
            var name = field.Name;
            descriptor.Field(name)
                .Description(field.Description)
                .Type(GraphQlTypeHelper.GetTypeNode(field.Type, field.IsArray))
                .Resolve(ctx => ctx.Parent<object>() is IDictionary<string, object> access
                    && access.TryGetValue(name, out var value) ? value : null);
        }
    }

    /// <summary>
    /// Whether the field <paramref name="fieldName"/> is one of the base entity's access lists served by this type. A project
    /// schema of the same name takes precedence and is served as any other schema type.
    /// </summary>
    public static bool Serves(string fieldName, string fieldType, IReadOnlyDictionary<string, SchemaDefinitionExtended> projectTypes) =>
        fieldType == TypeName
        && !projectTypes.ContainsKey(TypeName)
        && DefaultValueInjection.IsBaseEntityField(fieldName, fieldType);
}
