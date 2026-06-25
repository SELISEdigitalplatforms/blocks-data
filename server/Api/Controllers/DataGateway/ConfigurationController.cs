using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace DataGateway.Api.Controllers;


/// <summary>
/// OperateSchemaController provides endpoints to manage GraphQL schema operations.
/// It allows reloading the schema configuration, which is necessary after making changes to schema definitions or data sources.
/// </summary>
[Route("configurations")]
[ApiController]
public class ConfigurationController : ControllerBase
{
    private readonly IConfigurationService _configurationService;
    // private readonly ChangeControllerContext _changeControllerContext;
    private readonly ILogger<ConfigurationController> _logger;
    /// <summary>
    /// Initializes a new instance of the <see cref="ConfigurationController"/> class.
    /// </summary>
    /// <param name="configurationService">The configuration service.</param>
    /// <param name="logger">The logger.</param>
    /// <exception cref="ArgumentNullException">Thrown when the configuration service is null.</exception>
    public ConfigurationController(IConfigurationService configurationService, ILogger<ConfigurationController> logger)//, ChangeControllerContext changeControllerContext)
    {
        _configurationService = configurationService ?? throw new ArgumentNullException(nameof(configurationService));
        // _changeControllerContext = changeControllerContext ?? throw new ArgumentNullException(nameof(changeControllerContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Reloads the GraphQL schema configuration and resolves all unadapted changes.
    /// This endpoint evicts the cached schema executor and marks all pending schema changes as adapted to the server.
    /// Use this endpoint after making changes to schema definitions or data sources to refresh the schema and clear deployment badges in the UI.
    /// </summary>
    /// <returns>Returns a success response if the schema is reloaded and changes are resolved, or an error message if the operation fails.</returns>
    [Authorize]
    [HttpPost("reload")]
    [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ReloadDataGatewayServerAsync()
    {
        try
        {
            var tenantId = TenantContext.GetTenantId();
            _logger.LogInformation("Evicting schema for tenant: {TenantId}", tenantId);
            await _configurationService.ReloadAsync(tenantId, CancellationToken.None);
            return Ok(new ServiceResponse<bool>().SetSuccessMessage("Schema evicted successfully."));
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }


    // /// <summary>
    // /// 
    // /// </summary>
    // /// <param name="serverName"></param>
    // /// <param name="cancellationToken"></param>
    // /// <returns></returns>
    // [ApiExplorerSettings(IgnoreApi = true)]
    // [HttpPost("add/server")]
    // [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    // [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    // public async Task<IActionResult> AddGraphQLServerAsync([FromBody] string serverName, CancellationToken cancellationToken)
    // {
    //     try
    //     {
    //         // serverName carries the tenant id; evict its executor so it is (re)built on the next request.
    //         await _configurationService.ReloadAsync(ResolveTenantId(serverName), cancellationToken);
    //         return Ok(new ServiceResponse<bool>().SetSuccessMessage("Schema added successfully."));
    //     }
    //     catch (Exception ex)
    //     {
    //         return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
    //     }
    // }
}

