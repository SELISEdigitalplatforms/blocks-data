using System;

namespace DataGateway.DomainService.Models;

public class QueryResponse<T>
{
    public List<T> Items { get; set; } = [];
    public int TotalCount { get; set; }
    public int PageNo { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasNextPage => PageNo < TotalPages;
    public bool HasPreviousPage => PageNo > 1;
    public string? Message { get; set; }
}