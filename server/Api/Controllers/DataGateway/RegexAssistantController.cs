using Blocks.Genesis;
using DataGateway.DomainService.Services.RegexAssistant;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace BlocksTemplate.Api.Controllers
{

    /// <summary>
    /// Controller for assisting with regex pattern generation using AI.
    /// Provides an endpoint to generate regex patterns based on text descriptions.
    /// </summary>
    [ApiController]
    [Route("regex")]
    public class RegexAssistantController : ControllerBase
    {
        private readonly IRegexAssistantService _regexAssistantService;

        /// <summary>
        /// Initializes a new instance of the <see cref="RegexAssistantController"/> class.
        /// </summary>
        /// <param name="regexAssistantService"></param>
        public RegexAssistantController(IRegexAssistantService regexAssistantService)
        {
            _regexAssistantService = regexAssistantService;
        }

        /// <summary>
        /// Generates a regex pattern based on a text description using AI
        /// </summary>
        /// <param name="request">The regex generation request containing description and optional constraints</param>
        /// <returns>Generated regex pattern</returns>
        [HttpPost("generate-regex")]
        // Deprecated: use regex/generate-regex. Kept for backward compatibility.
        [HttpPost("generateregex")]
        [ProtectedEndPoint("blocks-data::regex-assistant::generate-regex")]
        public async Task<IActionResult> GenerateRegex([FromBody] RegexAssistantRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.Description))
            {
                return BadRequest(new { error = "Description is required" });
            }

            var regexPattern = await _regexAssistantService.GenerateRegexPattern(request);
            var errorMessage = _regexAssistantService.GetLastErrorMessage();

            return StatusCode((int)HttpStatusCode.OK, new
            {
                pattern = regexPattern,
                errorMessage
            });
        }
    }
}