using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Services;

public interface IGraphLogHistoryService
{
    /// <summary>
    /// Reads GraphQL request history for the current tenant from the trace store, most recent
    /// first by default.
    /// </summary>
    Task<PaginationResponse<GraphLogHistoryItemResponse>> GetHistoryAsync(GetGraphLogHistoryRequest request);

    /// <summary>
    /// Aggregates GraphQL request history for the current tenant into a requests-over-time series
    /// and per-field call/error stats, for an analytics dashboard.
    /// </summary>
    Task<GraphLogAnalyticsResponse> GetAnalyticsAsync(GetGraphLogAnalyticsRequest request);
}
