using System;

namespace DataGateway.DomainService.Models;

public class QueryResponse<T>
{
    private Lazy<Task<long>>? _totalCount;

    public List<T> Items { get; set; } = [];
    public int TotalCount { get; set; }
    public int PageNo { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => TotalPagesFor(TotalCount, PageSize);
    public bool HasNextPage => PageNo < TotalPages;
    public bool HasPreviousPage => PageNo > 1;
    public string? Message { get; set; }

    /// <summary>
    /// Counting every row that matches the filter is a scan of the collection, so the GraphQL
    /// gateway only does it when the response's <c>totalCount</c>, <c>totalPages</c> or
    /// <c>hasNextPage</c> is actually selected. The count runs at most once per response.
    /// </summary>
    public Func<Task<long>>? TotalCountProvider
    {
        set => _totalCount = value is null ? null : new Lazy<Task<long>>(value);
    }

    /// <summary>The total matching rows: counted on first use when a provider is set, else <see cref="TotalCount"/>.</summary>
    public Task<long> GetTotalCountAsync() => _totalCount?.Value ?? Task.FromResult((long)TotalCount);

    public static int TotalPagesFor(long totalCount, int pageSize) =>
        pageSize == 0 ? 0 : (int)Math.Ceiling((double)totalCount / pageSize);
}