namespace DataGateway.DomainService.Models;

public class UpdateDataSourceRequest : CreateDataSourceRequest
{
    public bool IsActive { get; set; } = true;
}