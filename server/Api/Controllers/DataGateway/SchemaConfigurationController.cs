using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace DataGateway.Api.Controllers;


/// <summary>
/// OperateSchemaController provides endpoints to manage GraphQL schema operations.
/// It allows reloading the schema configuration, which is necessary after making changes to schema definitions or data sources.
/// </summary>
[Route("schema-configurations")]
[ApiController]
public class SchemaConfigurationController : ControllerBase
{
    private readonly ISchemaConfigurationService _configurationService;
    private readonly ILogger<SchemaConfigurationController> _logger;
    /// <summary>
    /// Initializes a new instance of the <see cref="SchemaConfigurationController"/> class.
    /// </summary>
    /// <param name="configurationService">The configuration service.</param>
    /// <param name="logger">The logger.</param>
    /// <exception cref="ArgumentNullException">Thrown when the configuration service is null.</exception>
    public SchemaConfigurationController(ISchemaConfigurationService configurationService, ILogger<SchemaConfigurationController> logger)//, ChangeControllerContext changeControllerContext)
    {
        _configurationService = configurationService ?? throw new ArgumentNullException(nameof(configurationService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Publishes the tenant's schema changes to every gateway pod and resolves all unadapted changes.
    /// The definitions are test-built first; if they build, the tenant's published version is raised (every pod
    /// rebuilds when it sees the new version), this pod's executor is rebuilt before the response, and the pending
    /// schema changes are marked as adapted to the server.
    /// Use this endpoint after making changes to schema definitions or data sources to refresh the schema and clear deployment badges in the UI.
    /// </summary>
    /// <returns>Returns a success response if the schema is published, 400 with the build error if the definitions do not build (nothing is published), or an error message if the operation fails.</returns>
    [HttpPost("reload")]
    [ProtectedEndPoint("blocks-data::schema-configuration::reload-data-gateway-server")]
    [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
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
        catch (SchemaPublishException ex)
        {
            // The definitions do not build; nothing was published.
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }
}
