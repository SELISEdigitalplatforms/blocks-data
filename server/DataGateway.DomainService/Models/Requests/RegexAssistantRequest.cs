namespace DataGateway.DomainService.Services.RegexAssistant
{
    public class RegexAssistantRequest
    {
        /// <summary>
        /// Description of the regex pattern needed (e.g., "email validation", "phone number with format (XXX) XXX-XXXX")
        /// </summary>
        public string Description { get; set; }

        /// <summary>
        /// Optional: Example text that the regex should match
        /// </summary>
        public string ExampleText { get; set; } = string.Empty;

        /// <summary>
        /// Optional: Temperature for AI response (0-1, default 0.3 for more deterministic output)
        /// </summary>
        public double Temperature { get; set; } = 0.3;

        /// <summary>
        /// Optional: Additional context or constraints for the regex
        /// </summary>
        public string AdditionalContext { get; set; } = string.Empty;
    }
}
