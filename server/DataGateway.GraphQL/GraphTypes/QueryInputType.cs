
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.GraphTypes;

public class QueryInputType : InputObjectType<DynamicQueryInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<DynamicQueryInput> descriptor)
    {
        descriptor.Name("DynamicQueryInput");
        descriptor.Field(f => f.Filter).Type<StringType>();
        descriptor.Field(f => f.Sort).Type<StringType>();
        descriptor.Field(f => f.PageNo).Type<IntType>();
        descriptor.Field(f => f.PageSize).Type<IntType>();
    }
}
