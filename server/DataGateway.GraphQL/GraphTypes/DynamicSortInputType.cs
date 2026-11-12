using HotChocolate.Language;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// GraphQL input for a single sort clause: field name + direction.
/// </summary>
public class DynamicSortInputType : InputObjectType
{
    protected override void Configure(IInputObjectTypeDescriptor descriptor)
    {
        descriptor.Name("DynamicSortInput");
        descriptor.Description("Sort by a field and direction.");
        descriptor.Field("field")
            .Type<NonNullType<StringType>>()
            .Description("Name of the field to sort by.");
        descriptor.Field("direction")
            .Type<SortDirectionType>()
            .Description("Sort direction (ASC or DESC). Defaults to ASC.");
    }
}
