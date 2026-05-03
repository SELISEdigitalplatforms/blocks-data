using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class DeleteMockDataRequest : IProjectKey
{
    public string ProjectKey { get; set; } = string.Empty;
    public List<string> SchemaNames { get; set; } = new List<string>();
}