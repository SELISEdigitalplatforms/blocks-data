using Blocks.Genesis;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;

namespace DataGateway.Api.Controllers;

/// <summary>Read-only options for the Data console, resolved locally from the tenant's root document.</summary>
[ApiController]
[Route("gateway-options")]
public class GatewayOptionsController(IDataGatewayConfigurationService configuration) : ControllerBase
{
    /// <summary>Returns collection naming and analytics options without exposing connection settings.</summary>
    [HttpGet]
    [ProtectedEndPoint("blocks-data::schema::get-schema-definitions")]
    [ProducesResponseType(typeof(GatewayOptions), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetAsync()
    {
        var options = await configuration.GetOptionsAsync();
        return options is null ? NotFound() : Ok(options);
    }
}
