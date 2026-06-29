using System;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataGatewayConfigurationService
{
    Task<ServiceResponse<DataServiceConfigurationResponse>> GetConfiguration(string projectKey);
    Task<ServiceResponse<ActionResponse>> InsertConfiguration(CreateDataGatewayConfigurationRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateConfiguration(UpdateDataGatewayConfigurationRequest request);
}
