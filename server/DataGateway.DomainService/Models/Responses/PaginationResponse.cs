namespace DataGateway.DomainService.Models.Responses;

public class PaginationResponse<T>
{
    public long TotalCount { get; set; }
    public IEnumerable<T> Items { get; set; } = [];
    public PaginationResponse()
    {
    }
    public PaginationResponse(long totalCount, IEnumerable<T> items)
    {
        TotalCount = totalCount;
        Items = items;
    }
}
