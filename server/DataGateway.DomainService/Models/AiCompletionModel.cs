using System.Net;
namespace DataGateway.DomainService.Services.RegexAssistant
{
    public class AiCompletionModel
    {
        public string model { get; set; }
        public List<Message> messages { get; set; }
        public double temperature { get; set; }

        public AiCompletionModel ConstructCommand(string content, double temperature)
        {
            return new AiCompletionModel
            {
                model = "gpt-4o-mini",
                messages = new List<Message>
                {
                    new Message
                    {
                        role = "system",
                        content = "You are a regex pattern expert. Generate STRICT, production-grade regex patterns that validate input thoroughly. Prefer patterns that reject edge cases and enforce exact formats over lenient ones. Always anchor with ^ and $. Return your response as a JSON object with two fields: {\"pattern\": \"the regex\", \"errorMessage\": \"a short user-friendly error message for validation failure, max 80 chars\"}. No markdown, no code blocks — just the raw JSON object."
                    },
                    new Message { role = "user", content = content }
                },
                temperature = temperature
            };
        }
    }

    public class Message
    {
        public string role { get; set; }
        public string content { get; set; }
    }

    public class RestResponse
    {
        public HttpStatusCode HttpStatusCode { set; get; }
        public dynamic ResponseData { get; set; }
    }
}
