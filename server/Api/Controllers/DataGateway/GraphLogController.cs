using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers
{
    /// <summary>
    /// Exposes GraphQL request history (query/mutation traces) for the current tenant, read from
    /// the trace store that <c>Blocks.Genesis.MongoDBTraceExporter</c> writes to.
    /// </summary>
    [Route("graph-log")]
    [ApiController]
    public class GraphLogController : ControllerBase
    {
        private readonly IGraphLogHistoryService _graphLogHistoryService;

        public GraphLogController(IGraphLogHistoryService graphLogHistoryService)
        {
            _graphLogHistoryService = graphLogHistoryService;
        }

        /// <summary>
        /// Retrieves a paginated, most-recent-first list of GraphQL request history for the
        /// current tenant. Supports filtering by SchemaName (GraphQL field name), EntityName,
        /// OperationType ("query"/"mutation"), Outcome ("allowed"/"denied"/"error"), exact
        /// HTTP StatusCode, failure reason, sorting, and a From/To timestamp range.
        /// </summary>
        [HttpGet("history")]
        // [ProtectedEndPoint("blocks-data::graph-log::history")]
        [Authorize]
        [ProducesResponseType(typeof(ServiceResponse<PaginationResponse<GraphLogHistoryItemResponse>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetHistory([FromQuery] GetGraphLogHistoryRequest request)
        {
            var history = await _graphLogHistoryService.GetHistoryAsync(request);

            return Ok(new ServiceResponse<PaginationResponse<GraphLogHistoryItemResponse>>().SetSuccess(history));
        }

        /// <summary>
        /// Retrieves aggregated GraphQL request analytics for the current tenant: a requests-over-time
        /// series (success vs. failed, bucketed daily or weekly) and per-field call/error stats.
        /// </summary>
        [HttpGet("analytics")]
        // [ProtectedEndPoint("blocks-data::graph-log::analytics")]
        [Authorize]
        [ProducesResponseType(typeof(ServiceResponse<GraphLogAnalyticsResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetAnalytics([FromQuery] GetGraphLogAnalyticsRequest request)
        {
            var analytics = await _graphLogHistoryService.GetAnalyticsAsync(request);

            return Ok(new ServiceResponse<GraphLogAnalyticsResponse>().SetSuccess(analytics));
        }
    }
}
