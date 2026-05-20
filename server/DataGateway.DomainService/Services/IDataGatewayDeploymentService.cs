using Blocks.Genesis;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Services;

public interface IDataGatewayDeploymentService
{
    Task<bool> InitiateManualDataGatewayInstanceCreation(string projectKey);
    Task<bool> InitiateDataGatewayInstanceCreation(Tenant project);
}