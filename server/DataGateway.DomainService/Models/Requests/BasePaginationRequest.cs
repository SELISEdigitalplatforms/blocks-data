namespace DataGateway.DomainService.Models;

public class BasePaginationRequest
{
    public int PageNo { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string SortBy { get; set; } = "Id";
    public bool SortDescending { get; set; } = false;

    public BasePaginationRequest()
    {
    }

    public BasePaginationRequest(int pageNo, int pageSize, string sortBy, bool sortDescending)
    {
        PageNo = pageNo;
        PageSize = pageSize;
        SortBy = sortBy;
        SortDescending = sortDescending;
    }

}
