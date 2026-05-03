using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.GraphTypes;

public class QueryResponseType : ObjectType
{
    private readonly string _typeName;
    private readonly ObjectType _itemType;

    public QueryResponseType(string typeName, ObjectType itemType)
    {
        _typeName = typeName;
        _itemType = itemType;
    }

    protected override void Configure(IObjectTypeDescriptor descriptor)
    {
        descriptor.Name($"{_typeName}Result");

        descriptor
            .Field("items")
            .Type(new NonNullType(new ListType(new NonNullType(_itemType))))
            .Resolve(ctx =>
            {
                var parent = ctx.Parent<QueryResponse<Dictionary<string, object>>>();
                return parent.Items;
            });

        descriptor
            .Field("totalCount")
            .Type<NonNullType<IntType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().TotalCount);

        descriptor
            .Field("pageNo")
            .Type<NonNullType<IntType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().PageNo);

        descriptor
            .Field("pageSize")
            .Type<NonNullType<IntType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().PageSize);

        descriptor
            .Field("totalPages")
            .Type<NonNullType<IntType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().TotalPages);

        descriptor
            .Field("hasNextPage")
            .Type<NonNullType<BooleanType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().HasNextPage);

        descriptor
            .Field("hasPreviousPage")
            .Type<NonNullType<BooleanType>>()
            .Resolve(ctx => ctx.Parent<QueryResponse<Dictionary<string, object>>>().HasPreviousPage);
    }
}
