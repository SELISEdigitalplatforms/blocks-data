using System;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataAccessService
{
    Task<ServiceResponse<ActionResponse>> ConfigureSecurityAsync(ConfigureSchemaSecurityRequest request);
    Task<ServiceResponse<ActionResponse>> CreateDataAccessPolicyAsync(CreateDataAccessPolicyRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateDataAccessPolicyAsync(UpdateDataAccessPolicyRequest request);
    Task<ServiceResponse<ActionResponse>> DeleteDataAccessPolicyAsync(string itemId);
    Task<ServiceResponse<List<DataAccessPolicyResponse>>> GetEntityDataAccessPolicyAsync(string entityName);

}
