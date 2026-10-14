using Blocks.Genesis;
using Blocks.DataAccess.Entities;

namespace DataGateway.DomainService.Models;

public class DeleteDataAccessPolicyRequest : IProjectKey
{
    public string ItemId { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
}