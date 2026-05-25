namespace DataGateway.DomainService.Models;

public class DynamicQueryInput
{
    public string? Filter { get; set; }
    public string? Sort { get; set; }
    public int? PageNo { get; set; }
    public int? PageSize { get; set; }
}
