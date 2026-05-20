using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class CreateDataSourceRequest : IProjectKey
{
    public string ItemId { get; set; } = string.Empty;
    public string ConnectionString { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
}