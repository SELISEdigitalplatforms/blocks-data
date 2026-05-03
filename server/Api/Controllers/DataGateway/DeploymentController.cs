using Blocks.Genesis;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers.DataGateway;

[ApiController]
[Route("deployment")]
public class DeploymentController : ControllerBase
{
    private readonly IDataGatewayDeploymentService _dataGatewayDeploymentService;
    private readonly ChangeControllerContext _changeControllerContext;

    public DeploymentController(
        IDataGatewayDeploymentService dataGatewayDeploymentService,
        ChangeControllerContext changeControllerContext)
    {
        _dataGatewayDeploymentService = dataGatewayDeploymentService;
        _changeControllerContext = changeControllerContext;
    }

    [HttpGet("pipeline")]
    [Authorize]
    public async Task<IActionResult> DatagatewayPipelineInitiate([FromQuery] string projectKey)
    {
        _changeControllerContext.ChangeContext(new ProjectKeyModel { ProjectKey = projectKey });
        var result = await _dataGatewayDeploymentService.InitiateManualDataGatewayInstanceCreation(projectKey);
        if (result)
        {
            return Ok(result);
        }
        return BadRequest("Failed to initiate DataGateway pipeline");
    }
}