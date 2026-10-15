using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
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
    private readonly IDataGatewayConfigurationService _configurationService;
    private readonly ILogger<ConfigurationController> _logger;
    /// <summary>
    /// Initializes a new instance of the <see cref="ConfigurationController"/> class.
    /// </summary>
    /// <param name="configurationService">The configuration service.</param>
    /// <param name="logger">The logger.</param>
    /// <exception cref="ArgumentNullException">Thrown when the schema configuration service, configuration service, or logger is null.</exception>
    public ConfigurationController(IDataGatewayConfigurationService configurationService, ILogger<ConfigurationController> logger)
    {
        _configurationService = configurationService ?? throw new ArgumentNullException(nameof(configurationService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Retrieves the data source configuration for the current tenant.
    /// </summary>
    /// <returns>Returns the data source configuration (database name, collection naming, analytics, ConnectionType Default or Custom). The connection string and the secret value are never returned. A tenant with no configuration gets the default one created on first use.</returns>
    [HttpGet]
    [ProtectedEndPoint("blocks-data::configuration::get-configuration")]
    [ProducesResponseType(typeof(ServiceResponse<DataGatewayConfigurationResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetConfigurationAsync()
    {
        try
        {
            var tenantId = TenantContext.GetTenantId();
            var response = await _configurationService.GetConfiguration(tenantId);
            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Saves the data source configuration (same save as PUT; the ItemId is ignored). The connection string is stored in Blocks Secrets, never in the configuration document.
    /// </summary>
    /// <param name="request">The data source details to be saved. ConnectionString: "default" or empty = Blocks DB, otherwise the plain connection string. DatabaseName is required for a custom connection. ProjectKey is required.</param>
    /// <returns>Returns a success response if the data source is created, or an error message if the operation fails.</returns>
    [HttpPost]
    [ProtectedEndPoint("blocks-data::configuration::create-data-source")]
    [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> InsertDataSourceAsync([FromBody] CreateDataGatewayConfigurationRequest request)
    {
        try
        {
            var response = await _configurationService.InsertConfiguration(request);
            return StatusCode(response.HttpStatusCode, response);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Updates the data source configuration. ConnectionString: "default" or empty = Blocks DB, a real string = custom (the secret is rotated), omitted = keep the current one.
    /// </summary>
    /// <param name="request">The updated data source details. Required fields: ItemId (the id GET returns), ProjectKey.</param>
    /// <returns>Returns a success response if the data source is updated, or an error message if the operation fails.</returns>
    [HttpPut]
    [ProtectedEndPoint("blocks-data::configuration::update-data-source")]
    [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateDataSourceAsync([FromBody] UpdateDataGatewayConfigurationRequest request)
    {
        try
        {
            var response = await _configurationService.UpdateConfiguration(request);
            return StatusCode(response.HttpStatusCode, response);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }


}

