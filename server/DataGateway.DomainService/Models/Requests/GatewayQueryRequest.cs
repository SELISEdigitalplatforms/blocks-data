namespace DataGateway.DomainService.Models.Requests;

public class GatewayQueryRequest
{
    public object? Where { get; set; }
    public object? Order { get; set; }
    public string? Filter { get; set; }
    public string? Sort { get; set; }
    public int? Page { get; set; }
    public int? PerPage { get; set; }
    public List<string>? Fields { get; set; }
}
