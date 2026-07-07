using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
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
    /// <returns>Returns the data source configuration details, including the connection string, database name, and project key, or an error message if the data source is not found.</returns>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(ServiceResponse<DataServiceConfigurationResponse>), StatusCodes.Status200OK)]
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
    /// Creates a new data source configuration. Use this endpoint to add a new database connection for your platform.
    /// </summary>
    /// <param name="request">The data source details to be saved. Required fields: ItemId (unique identifier), ConnectionString (database connection string), DatabaseName (name of the database), ProjectKey (project identifier).</param>
    /// <returns>Returns a success response if the data source is created, or an error message if the operation fails.</returns>
    [Authorize]
    [HttpPost]
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
    /// Updates an existing data source configuration. Use this endpoint to modify the connection string, database name, or other details for an existing data source.
    /// </summary>
    /// <param name="request">The updated data source details. Required fields: ItemId (unique identifier), ConnectionString, DatabaseName, ProjectKey, IsActive.</param>
    /// <returns>Returns a success response if the data source is updated, or an error message if the operation fails.</returns>
    [Authorize]
    [HttpPut]
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

