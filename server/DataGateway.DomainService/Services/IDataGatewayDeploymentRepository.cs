using Blocks.Genesis;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Services;

public interface IDataGatewayDeploymentRepository
{
    Task<Tenant?> GetTenantByIdAsync(string projectKey);
    Task<BlocksGuid?> GetBlocksGuidAsync(string tenantGroupId);
    Task<bool> UpsertDataGatewayInstanceAsync(Tenant project, string projectGuidId, string pipelineRunName);
    Task<bool> UpdatePipelineStatusAsync(string tenantId, string pipelineRunName, string newStatus);
}