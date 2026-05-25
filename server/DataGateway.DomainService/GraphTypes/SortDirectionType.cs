using DataGateway.DomainService.Models;
using HotChocolate.Types;

namespace DataGateway.DomainService.GraphTypes;

/// <summary>
/// GraphQL enum for sort direction (ASC, DESC).
/// </summary>
public class SortDirectionType : EnumType<SortDirection>
{
    protected override void Configure(IEnumTypeDescriptor<SortDirection> descriptor)
    {
        descriptor.Name("SortDirection");
        descriptor.Description("Direction for ordering results.");
    }
}
