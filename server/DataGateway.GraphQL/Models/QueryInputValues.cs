namespace DataGateway.DomainService.Models;

/// <summary>
/// Values from <c>input</c> (<see cref="DynamicQueryInput"/>), optional <c>paging</c> (<see cref="PaginationInput"/>),
/// and optional <c>where</c> / <c>order</c>.
/// </summary>
internal sealed class QueryInputValues
{
    public string? Filter { get; set; }
    public string? Sort { get; set; }
    public object? Where { get; set; }
    public object? Order { get; set; }
    public int? PageNo { get; set; }
    public int? PageSize { get; set; }
}
