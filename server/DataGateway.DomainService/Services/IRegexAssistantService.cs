namespace DataGateway.DomainService.Services.RegexAssistant
{
    public interface IRegexAssistantService
    {
        Task<string> GenerateRegexPattern(RegexAssistantRequest request);
        Task<string> AiCompletion(AiCompletionRequest request);
    }
}
