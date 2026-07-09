using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DataGateway.Api.Controllers;


/// <summary>
/// MockDataController provides endpoints to manage mock data operations.
/// It allows retrieving and deleting mock data for a specific project.
/// </summary>
[Route("mock-data")]
[ApiController]
public class MockDataController : ControllerBase
{
    private readonly IMockDataService _dataManageService;

    /// <summary>
    /// Initializes a new instance of the <see cref="MockDataController"/> class.
    /// </summary>
    /// <param name="dataManageService"></param>
    /// <exception cref="ArgumentException"></exception>
    public MockDataController(IMockDataService dataManageService)
    {
        _dataManageService = dataManageService ?? throw new ArgumentException(nameof(dataManageService));
    }

    /// <summary>
    /// Gets mock data from the database.
    /// </summary>
    /// <returns>Returns the mock data for the project.</returns>
    [HttpGet]
    [ProtectedEndPoint("data::mock-data::get-mock-data")]
    [ProducesResponseType(typeof(ServiceResponse<MockDataResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetMockDataAsync()
    {
        var response = await _dataManageService.GetMockData();

        return Ok(response);
    }

    /// <summary>
    /// Deletes mock data from the database.
    /// </summary>
    /// <param name="request"></param>
    /// <returns></returns>
    [HttpDelete]
    [ProtectedEndPoint("data::mock-data::delete-mock-data")]
    [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DeleteMockData([FromBody] DeleteMockDataRequest request)
    {

        if (request.SchemaNames == null || request.SchemaNames.Count == 0)
        {
            return BadRequest(new { Message = "No schema names provided" });
        }

        var response = await _dataManageService.DeleteMockData(request);

        return StatusCode(response.HttpStatusCode, response);
    }
}
