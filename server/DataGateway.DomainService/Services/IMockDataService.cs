using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IMockDataService
{
    Task<ServiceResponse<MockDataResponse>> GetMockData();
    Task<ServiceResponse<ActionResponse>> DeleteMockData(DeleteMockDataRequest request);
}
