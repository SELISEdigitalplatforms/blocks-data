using System;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataSourceService
{
    Task<ServiceResponse<DataSourceResponse>> GetDataSource(string projectKey);
    Task<ServiceResponse<ActionResponse>> InsertDataSource(CreateDataSourceRequest request);
    Task<ServiceResponse<ActionResponse>> UpdateDataSource(UpdateDataSourceRequest request);
}
