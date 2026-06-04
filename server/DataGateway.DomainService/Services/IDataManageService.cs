using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IDataManageService
{
    Task<ServiceResponse<MockDataResponse>> GetMockData();
    Task<ServiceResponse<ActionResponse>> DeleteMockData(DeleteMockDataRequest request);
}
