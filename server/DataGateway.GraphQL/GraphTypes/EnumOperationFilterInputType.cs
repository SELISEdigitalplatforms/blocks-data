using DataGateway.DomainService.Helpers;
using HotChocolate.Language;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// Per-field Enum filter input: eq, neq, in, nin — values typed as the field's own EnumType.
/// Non-generic so HotChocolate does not invent an empty <c>ObjectInput</c> from a CLR model.
/// </summary>
public sealed class EnumOperationFilterInputType : InputObjectType
{
    private readonly string _filterTypeName;
    private readonly string _enumTypeName;

    public EnumOperationFilterInputType(string schemaName, string fieldName)
    {
        _enumTypeName = GraphQlTypeHelper.GetEnumTypeName(schemaName, fieldName);
        _filterTypeName = GraphQlTypeHelper.GetEnumOperationFilterTypeName(schemaName, fieldName);
    }

    protected override void Configure(IInputObjectTypeDescriptor descriptor)
    {
        descriptor.Name(_filterTypeName);
        descriptor.Description($"Filter operations for {_enumTypeName}.");
        var enumNamed = new NamedTypeNode(_enumTypeName);
        descriptor.Field("eq").Type(enumNamed).Description("Equals.");
        descriptor.Field("neq").Type(enumNamed).Description("Not equals.");
        descriptor.Field("in").Type(new ListTypeNode(enumNamed)).Description("In list.");
        descriptor.Field("nin").Type(new ListTypeNode(enumNamed)).Description("Not in list.");
    }
}
