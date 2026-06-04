using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DataGateway.Api.Controllers;

[Route("data-manage")]
[ApiController]
public class DataManageController : ControllerBase
{
    private readonly IDataManageService _dataManageService;
    // private readonly ChangeControllerContext _changeControllerContext;

    /// <summary>
    /// Initializes a new instance of the <see cref="DataManageController"/> class.
    /// </summary>
    /// <param name="dataManageService"></param>
    /// <param name="changeControllerContext"></param>
    /// <exception cref="ArgumentException"></exception>
    public DataManageController(IDataManageService dataManageService)//, ChangeControllerContext changeControllerContext)
    {
        _dataManageService = dataManageService ?? throw new ArgumentException(nameof(dataManageService));
        // _changeControllerContext = changeControllerContext ?? throw new ArgumentException(nameof(changeControllerContext));
    }


    /// <summary>
    /// Cloud use only: Gets mock data from the database.
    /// </summary>
    /// <param name="projectKey"></param>
    /// <returns></returns>
    [Authorize]
    [HttpGet("{projectKey}/mock-data")]
    [ProducesResponseType(typeof(ServiceResponse<MockDataResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetMockData([FromRoute] string projectKey)
    {
        if (string.IsNullOrEmpty(projectKey))
        {
            return BadRequest(new { Message = "INVALID_PROJECT_KEY" });
        }

        // _changeControllerContext.ChangeContext(new ProjectKeyModel
        // {
        //     ProjectKey = projectKey
        // });

        var response = await _dataManageService.GetMockData();

        return Ok(response);
    }

    /// <summary>
    /// Gets mock data from the database.
    /// </summary>
    /// <returns>Returns the mock data for the project.</returns>
    [Authorize]
    [HttpGet("mock-data")]
    [ProducesResponseType(typeof(ServiceResponse<MockDataResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetMockDataAsync()
    {
        // _changeControllerContext.ChangeContext(new ProjectKeyModel
        // {
        //     ProjectKey = projectKey
        // });
        var response = await _dataManageService.GetMockData();

        return Ok(response);
    }

    /// <summary>
    /// Deletes mock data from the database.
    /// </summary>
    /// <param name="request"></param>
    /// <returns></returns>
    [Authorize]
    [HttpPost("mock-data")]
    [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DeleteMockData([FromBody] DeleteMockDataRequest request)
    {
        if (string.IsNullOrEmpty(request.ProjectKey))
        {
            return BadRequest(new { Message = "INVALID_PROJECT_KEY" });
        }

        if (request.SchemaNames == null || request.SchemaNames.Count == 0)
        {
            return BadRequest(new { Message = "No schema names provided" });
        }

        // _changeControllerContext.ChangeContext(new ProjectKeyModel
        // {
        //     ProjectKey = request.ProjectKey
        // });

        var response = await _dataManageService.DeleteMockData(request);

        return StatusCode(response.HttpStatusCode, response);
    }
}
