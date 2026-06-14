using DataGateway.DomainService.Services.RegexAssistant;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace DataGateway.Api.Controllers;

[ApiController]
[Route("regex")]
public class RegexAssistantController : ControllerBase
{
    private readonly IRegexAssistantService _regexAssistantService;

    public RegexAssistantController(IRegexAssistantService regexAssistantService)
    {
        _regexAssistantService = regexAssistantService;
    }

    /// <summary>
    /// Generates a regex pattern based on a text description using AI
    /// </summary>
    /// <param name="request">The regex generation request containing description and optional constraints</param>
    /// <returns>Generated regex pattern</returns>
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> GenerateRegex([FromBody] RegexAssistantRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Description))
        {
            return BadRequest(new { error = "Description is required" });
        }

        var regexPattern = await _regexAssistantService.GenerateRegexPattern(request);

        return StatusCode((int)HttpStatusCode.OK, new
        {
            pattern = regexPattern
        });
    }
}

