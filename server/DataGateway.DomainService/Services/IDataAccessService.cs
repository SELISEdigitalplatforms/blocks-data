using System;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataAccessService
{
    Task<ServiceResponse<ActionResponse>> ConfigureSecurity(ConfigureSchemaSecurityRequest request);
    Task<ServiceResponse<ActionResponse>> CreateDataAccessPolicy(CreateDataAccessPolicyRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateDataAccessPolicy(UpdateDataAccessPolicyRequest request);
    Task<ServiceResponse<ActionResponse>> DeleteDataAccessPolicy(string itemId, string projectKey);
    Task<ServiceResponse<List<DataAccessPolicyResponse>>> GetEntityDataAccessPolicy(string entityName);
    Task IsDataAccessible();

}
