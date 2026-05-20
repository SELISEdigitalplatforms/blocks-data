using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.GraphTypes;

public class PaginationInputType : InputObjectType<PaginationInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<PaginationInput> descriptor)
    {
        descriptor.Name("PaginationInput");
        descriptor.Field(f => f.PageNo).Type<IntType>();
        descriptor.Field(f => f.PageSize).Type<IntType>();
    }
}
