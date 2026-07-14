namespace DataGateway.DomainService.Models;

public class UpdateDataGatewayConfigurationRequest : CreateDataGatewayConfigurationRequest
{
    public bool IsCollectionNameEditable { get; set; }
    public string CollectionNamePattern { get; set; } = string.Empty;

}