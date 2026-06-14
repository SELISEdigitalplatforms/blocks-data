using DataGateway.DomainService.Services.RegexAssistant;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Net;

namespace BlocksTemplate.Api.Controllers
{
    [ApiController]
    [Route("[controller]/[action]")]
    public class RegexAssistantController : ControllerBase
    {
        private readonly IRegexAssistantService _regexAssistantService;
        private readonly ILogger<RegexAssistantController> _logger;

        public RegexAssistantController(IRegexAssistantService regexAssistantService, ILogger<RegexAssistantController> logger)
        {
            _regexAssistantService = regexAssistantService;
            _logger = logger;
            _logger.LogInformation("RegexAssistantController: Constructor called");
        }

        /// <summary>
        /// Health check endpoint
        /// </summary>
        [HttpGet]
        [AllowAnonymous]
        public IActionResult Health()
        {
            _logger.LogInformation("RegexAssistantController: Health endpoint called");
            return Ok(new { status = "healthy", message = "RegexAssistant API is running" });
        }

        /// <summary>
        /// Generates a regex pattern based on a text description using AI
        /// </summary>
        /// <param name="request">The regex generation request containing description and optional constraints</param>
        /// <returns>Generated regex pattern</returns>
        [HttpPost]
        [AllowAnonymous]
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
}
