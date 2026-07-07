using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class DeleteMockDataRequest
{
    public List<string> SchemaNames { get; set; } = new List<string>();
}