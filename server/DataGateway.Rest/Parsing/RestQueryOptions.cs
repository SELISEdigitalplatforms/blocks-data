using DataGateway.DomainService.Gateway;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// A list request, checked against the entity, in the form both the query string (<c>GET</c>) and the body
/// (<c>POST</c>) parse into. <see cref="Order"/> is null when no order was given; an empty <see cref="Select"/>
/// means every field the caller may read.
/// </summary>
public sealed record RestQueryOptions(
    WhereNode? Where,
    IReadOnlyList<OrderItem>? Order,
    int PageNo,
    int PageSize,
    IReadOnlyList<string> Select,
    bool IncludeTotalCount);
