namespace DataGateway.DomainService.Services.RegexAssistant
{
    public class ChatGptAiCompletionResponse
    {
        public List<Choice> choices { get; set; }
    }

    public class Choice
    {
        public Message message { get; set; }
    }
}
