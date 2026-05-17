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
    /// <summary>
    /// Initializes a new instance of the <see cref="ConfigurationController"/> class.
    /// </summary>
    /// <param name="configurationService">The configuration service.</param>
    /// <exception cref="ArgumentNullException">Thrown when the configuration service is null.</exception>
    /// <param name="changeControllerContext">The change Controller service.</param>
    /// <exception cref="ArgumentNullException">Thrown when the changeControllerContext is null.</exception>
    public ConfigurationController(IConfigurationService configurationService)//, ChangeControllerContext changeControllerContext)
    {
        _configurationService = configurationService ?? throw new ArgumentNullException(nameof(configurationService));
        // _changeControllerContext = changeControllerContext ?? throw new ArgumentNullException(nameof(changeControllerContext));
    }

    /// <summary>
    /// Cloud use only: Reloads the GraphQL schema configuration. Use this endpoint after making changes to schema definitions or data sources to refresh the schema.
    /// </summary>
    /// <param name="projectKey">The unique identifier of the project to retrieve.</param>
    /// <param name="cancellationToken">A cancellation token to cancel the operation if needed.</param>
    /// <returns>Returns a success response if the schema is reloaded, or an error message if the operation fails.</returns>
    [Authorize]
    [HttpPost("{projectKey}/reload")]
    [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ReloadGraphQlServerAsync([FromRoute] string projectKey, CancellationToken cancellationToken)
    {
        try
        {
            // _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            var projectShortKey = TenantHelper.GetProjectShortKeyFromRequestUri();
            await _configurationService.ReloadAsync(projectShortKey, cancellationToken);
            return Ok(new ServiceResponse<bool>().SetSuccessMessage("Schema reloaded successfully."));
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Reloads the GraphQL schema configuration. Use this endpoint after making changes to schema definitions or data sources to refresh the schema.
    /// </summary>
    /// <param name="projectKey">The unique identifier of the project to retrieve.</param>
    /// <returns>Returns a success response if the schema is reloaded, or an error message if the operation fails.</returns>
    [Authorize]
    [HttpPost("reload")]
    [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ReloadDataGatewayServerAsync(string projectKey = "")
    {
        try
        {
            // _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
            await _configurationService.ReloadAsync(GraphQlConstant.TenantSlug, CancellationToken.None);
            return Ok(new ServiceResponse<bool>().SetSuccessMessage("Schema reloaded successfully."));
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }


    /// <summary>
    /// 
    /// </summary>
    /// <param name="serverName"></param>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
    [ApiExplorerSettings(IgnoreApi = true)]
    [HttpPost("add/server")]
    [ProducesResponseType(typeof(ServiceResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> AddGraphQLServerAsync([FromBody] string serverName, CancellationToken cancellationToken)
    {
        try
        {
            var projectShortKey = TenantHelper.GetProjectShortKeyFromRequestUri();
            await _configurationService.AddSchemaAsync(projectShortKey, cancellationToken);
            return Ok(new ServiceResponse<bool>().SetSuccessMessage("Schema added successfully."));
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
    }
}

