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
                        content = "You are a regex pattern expert. When asked to generate a regex pattern, respond with ONLY the regex pattern itself. Do not include explanations, code blocks, quotes, or any additional text. Just return the raw regex pattern that can be directly used in code."
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
