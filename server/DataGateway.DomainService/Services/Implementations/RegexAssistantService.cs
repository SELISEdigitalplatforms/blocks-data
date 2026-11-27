using Blocks.Genesis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Globalization;
using System.Net;
using System.Security.Cryptography;

namespace DataGateway.DomainService.Services.RegexAssistant
{
    public class RegexAssistantService : IRegexAssistantService
    {
        /// <summary>Model used when the <c>Ai:Model</c> setting is empty: the value this service always sent before the setting existed.</summary>
        public const string LegacyDefaultModel = "gpt-4o-mini";

        private readonly ILogger<RegexAssistantService> _logger;
        private readonly IConfiguration _configuration;
        private readonly string _aiCompletionUrl;
        private readonly string _chatGptTemperature;
        private readonly HttpClient _httpClient;
        private readonly ICloudBuildSecret _cloudBuildSecret;
        private readonly IChatCompletionClient _chatClient;
        private string _lastErrorMessage;

        public RegexAssistantService(
            ILogger<RegexAssistantService> logger,
            IConfiguration configuration,
            HttpClient httpClient,
            ICloudBuildSecret cloudBuildSecret,
            IChatCompletionClient chatClient = null
        )
        {
            _logger = logger;
            _configuration = configuration;
            var options = AiOptions.FromConfiguration(_configuration, AiProvider.OpenAiCompatible);
            _aiCompletionUrl = options.Endpoint;
            _chatGptTemperature = (options.Temperature ?? 0.1).ToString(CultureInfo.InvariantCulture);
            _httpClient = httpClient;
            _cloudBuildSecret = cloudBuildSecret;
            _chatClient = chatClient;

            _logger.LogInformation("RegexAssistantService: Constructor called");
            _logger.LogInformation($"RegexAssistantService: AI URL: {_aiCompletionUrl}");
            _logger.LogInformation($"RegexAssistantService: Temperature: {_chatGptTemperature}");
            _logger.LogInformation($"RegexAssistantService: CloudBuildSecret is null: {cloudBuildSecret == null}");
        }

        public async Task<string> GenerateRegexPattern(RegexAssistantRequest request)
        {
            try
            {
                _logger.LogInformation($"GenerateRegexPattern: Starting - Description: {request.Description}");
                var context = BuildRegexContext(request);
                _logger.LogInformation($"GenerateRegexPattern: Context built");

                var temperature = request.Temperature > 0 ? request.Temperature : double.Parse(_chatGptTemperature, CultureInfo.InvariantCulture);

                var aiCompletionRequest = new AiCompletionRequest(context, temperature);
                _logger.LogInformation($"GenerateRegexPattern: Calling AiCompletion");

                var regexPattern = await AiCompletion(aiCompletionRequest);

                var maxRetryCount = 3;
                var retryCount = 0;

                while (string.IsNullOrEmpty(regexPattern) && retryCount < maxRetryCount)
                {
                    _logger.LogInformation($"GenerateRegexPattern: Retry {retryCount + 1}/{maxRetryCount}");
                    await Task.Delay(2000);
                    regexPattern = await AiCompletion(aiCompletionRequest);
                    retryCount++;
                }

                if (retryCount >= maxRetryCount)
                {
                    _logger.LogError("GenerateRegexPattern: Maximum retry count reached");
                    return null;
                }

                var output = FormatRegexPattern(regexPattern, out var errorMessage);
                _lastErrorMessage = errorMessage;
                _logger.LogInformation($"GenerateRegexPattern: Formatting complete - Output: {output}");
                return output;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GenerateRegexPattern: Exception occurred");
                return null;
            }
        }

        public async Task<string> AiCompletion(AiCompletionRequest request)
        {
            try
            {
                _logger.LogInformation("AiCompletion: Starting AI completion request");
                TemperatureValidator(request.Temperature);

                if (_cloudBuildSecret == null)
                {
                    _logger.LogError("AiCompletion: ICloudBuildSecret is null - dependency injection failed");
                    return null;
                }

                var options = AiOptions.FromConfiguration(_configuration, AiProvider.OpenAiCompatible);
                var apiKey = options.ResolveApiKey(_configuration);
                if (string.IsNullOrEmpty(apiKey))
                {
                    var encryptedSecret = await GetEncryptedSecretAsync();
                    if (string.IsNullOrEmpty(encryptedSecret))
                    {
                        _logger.LogError("AiCompletion: no API key. Set 'Ai:ApiKeyReference', or configure 'ChatGptEncryptedSecret' and 'ChatGptEncryptionKey' in the vault.");
                        return null;
                    }

                    _logger.LogInformation("AiCompletion: Encrypted secret retrieved, attempting decryption");
                    apiKey = GetDecryptedSecret(encryptedSecret);
                    if (string.IsNullOrEmpty(apiKey))
                    {
                        _logger.LogError("Failed to decrypt ChatGPT API key");
                        return null;
                    }
                }

                var payload = new AiCompletionModel().ConstructCommand(request.Message, request.Temperature, options.Model ?? LegacyDefaultModel);
                var messages = payload.messages.Select(m => new ChatMessage(m.role, m.content)).ToList();
                var client = _chatClient ?? ChatCompletionClients.Create(_httpClient, options, () => apiKey, _logger);

                // The client has no timeout of its own; the cap that was here stays.
                using (var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(30)))
                {
                    var result = await client.CompleteAsync(messages, new ChatCompletionOptions { Model = payload.model, Temperature = request.Temperature }, cts.Token);
                    _logger.LogInformation("AiCompletion: Success - {PromptTokens} prompt and {CompletionTokens} completion tokens",
                        result.Usage?.PromptTokens, result.Usage?.CompletionTokens);
                    return result.Text;
                }
            }
            catch (System.Threading.Tasks.TaskCanceledException ex)
            {
                _logger.LogError(ex, "AiCompletion: Request timeout after 30 seconds");
            }
            catch (ChatCompletionException ex)
            {
                _logger.LogError("AiCompletion: {Message}", ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AiCompletion: Exception occurred");
            }

            return null;
        }

        private async Task<string> GetEncryptedSecretAsync()
        {
            return _cloudBuildSecret.ChatGptEncryptedSecret;
        }

        private string GetDecryptedSecret(string encryptedText)
        {
            var key = _cloudBuildSecret.ChatGptEncryptionKey;
            var salt = GetSalt();

            if (salt is null)
            {
                throw new ArgumentException("Salt is null");
            }

            var decryptedValue = Decrypt(encryptedText, key, salt);
            return decryptedValue;
        }

        public byte[] GetSalt() =>
            _configuration.GetSection("Salt").Get<byte[]>();

        public static string Decrypt(string encryptedText, string key, byte[] salt)
        {
            var cipherText = Convert.FromBase64String(encryptedText);

            using (var aesAlg = Aes.Create())
            {
                var keyDerivationFunction = new Rfc2898DeriveBytes(key, salt);
                aesAlg.Key = keyDerivationFunction.GetBytes(aesAlg.KeySize / 8);
                aesAlg.IV = keyDerivationFunction.GetBytes(aesAlg.BlockSize / 8);

                var decryptor = aesAlg.CreateDecryptor(aesAlg.Key, aesAlg.IV);

                string decryptedText;
                using (var msDecrypt = new System.IO.MemoryStream(cipherText))
                {
                    using (var csDecrypt = new CryptoStream(msDecrypt, decryptor, CryptoStreamMode.Read))
                    {
                        using (var srDecrypt = new System.IO.StreamReader(csDecrypt))
                        {
                            decryptedText = srDecrypt.ReadToEnd();
                        }
                    }
                }

                return decryptedText;
            }
        }

        private string BuildRegexContext(RegexAssistantRequest request)
        {
            var context = $"Generate a regex pattern for: {request.Description}";

            if (!string.IsNullOrWhiteSpace(request.ExampleText))
            {
                context += $"\n\nExample text that should match: {request.ExampleText}";
            }

            if (!string.IsNullOrWhiteSpace(request.AdditionalContext))
            {
                context += $"\n\nAdditional requirements: {request.AdditionalContext}";
            }

            return context;
        }

        private static string FormatRegexPattern(string aiText, out string errorMessage)
        {
            errorMessage = null;

            if (string.IsNullOrWhiteSpace(aiText))
            {
                return string.Empty;
            }

            var trimmed = aiText.Trim();

            // Remove common code-block wrappers first so we can inspect the raw inner content.
            if (trimmed.StartsWith("```"))
            {
                var codeMatch = System.Text.RegularExpressions.Regex.Match(
                    trimmed,
                    @"```(?:regex)?\s*(.*?)\s*```",
                    System.Text.RegularExpressions.RegexOptions.Singleline,
                    TimeSpan.FromSeconds(1));
                if (codeMatch.Success)
                {
                    trimmed = codeMatch.Groups[1].Value.Trim();
                }
            }

            // Preferred: AI returns a JSON object with `pattern` + `errorMessage`.
            if (trimmed.StartsWith("{") && trimmed.EndsWith("}"))
            {
                try
                {
                    var obj = JObject.Parse(trimmed);
                    var patternToken = obj["pattern"] ?? obj["Pattern"];
                    if (patternToken != null && !string.IsNullOrWhiteSpace(patternToken.ToString()))
                    {
                        var errorToken = obj["errorMessage"] ?? obj["ErrorMessage"];
                        if (errorToken != null && !string.IsNullOrWhiteSpace(errorToken.ToString()))
                        {
                            errorMessage = errorToken.ToString().Trim();
                        }
                        return patternToken.ToString().Trim();
                    }
                }
                catch (JsonException)
                {
                    // Fall through to legacy plain-text parsing.
                }
            }

            // Legacy: strip surrounding quotes if present (plain regex response).
            if ((trimmed.StartsWith("\"") && trimmed.EndsWith("\"")) ||
                (trimmed.StartsWith("'") && trimmed.EndsWith("'")))
            {
                trimmed = trimmed.Substring(1, trimmed.Length - 2);
            }

            return trimmed.Trim();
        }

        public string GetLastErrorMessage() => _lastErrorMessage;

        private static void TemperatureValidator(double temperature)
        {
            if (temperature < 0 || temperature > 2)
            {
                throw new ArgumentException("Invalid Temperature Value. Must be between 0 and 2.");
            }
        }
    }
}
