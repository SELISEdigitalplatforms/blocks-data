using System.Net;
using System.Security.Cryptography;
using System.Text;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Services.RegexAssistant;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace XUnitTest.DataGateway.Services;

public class RegexAssistantServiceTests
{
    private const string Key = "super-secret-key";
    private static readonly byte[] Salt = Enumerable.Range(1, 16).Select(i => (byte)i).ToArray();

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(_responder(request));
    }

    private static string Encrypt(string plainText)
    {
        using var aes = Aes.Create();
        var kdf = new Rfc2898DeriveBytes(Key, Salt);
        aes.Key = kdf.GetBytes(aes.KeySize / 8);
        aes.IV = kdf.GetBytes(aes.BlockSize / 8);
        using var enc = aes.CreateEncryptor(aes.Key, aes.IV);
        var bytes = Encoding.UTF8.GetBytes(plainText);
        var cipher = enc.TransformFinalBlock(bytes, 0, bytes.Length);
        return Convert.ToBase64String(cipher);
    }

    private static IConfiguration Config()
    {
        var dict = new Dictionary<string, string?>
        {
            ["AiCompletionUrl"] = "https://ai.example.com/v1/chat",
            ["ChatGptTemperature"] = "0.2"
        };
        for (var i = 0; i < Salt.Length; i++)
        {
            dict[$"Salt:{i}"] = Salt[i].ToString();
        }
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static Mock<ICloudBuildSecret> Secret(string? encrypted)
    {
        var m = new Mock<ICloudBuildSecret>();
        m.SetupGet(s => s.ChatGptEncryptedSecret).Returns(encrypted);
        m.SetupGet(s => s.ChatGptEncryptionKey).Returns(Key);
        return m;
    }

    private static RegexAssistantService Build(HttpMessageHandler handler, ICloudBuildSecret secret)
        => new(NullLogger<RegexAssistantService>.Instance, Config(), new HttpClient(handler), secret);

    private static HttpResponseMessage Ok(string content)
    {
        var body = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":" + System.Text.Json.JsonSerializer.Serialize(content) + "}}]}";
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) };
    }

    [Fact]
    public void GetSalt_ReturnsConfiguredBytes()
    {
        var svc = Build(new StubHandler(_ => Ok("x")), Secret(Encrypt("api-key")).Object);
        svc.GetSalt().Should().Equal(Salt);
    }

    [Fact]
    public void Decrypt_RoundTrips()
    {
        RegexAssistantService.Decrypt(Encrypt("hello world"), Key, Salt).Should().Be("hello world");
    }

    [Fact]
    public async Task AiCompletion_NullSecret_ReturnsNull()
    {
        var svc = Build(new StubHandler(_ => Ok("x")), null!);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 0.1));
        result.Should().BeNull();
    }

    [Fact]
    public async Task AiCompletion_InvalidTemperature_ReturnsNull()
    {
        var svc = Build(new StubHandler(_ => Ok("x")), Secret(Encrypt("k")).Object);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 5));
        result.Should().BeNull();
    }

    [Fact]
    public async Task AiCompletion_EmptyEncryptedSecret_ReturnsNull()
    {
        var svc = Build(new StubHandler(_ => Ok("x")), Secret("").Object);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 0.1));
        result.Should().BeNull();
    }

    [Fact]
    public async Task AiCompletion_Success_ReturnsContent()
    {
        var svc = Build(new StubHandler(_ => Ok("^abc$")), Secret(Encrypt("api-key")).Object);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 0.1));
        result.Should().Be("^abc$");
    }

    [Fact]
    public async Task AiCompletion_NonSuccessStatus_ReturnsNull()
    {
        var svc = Build(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.BadRequest) { Content = new StringContent("bad") }), Secret(Encrypt("api-key")).Object);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 0.1));
        result.Should().BeNull();
    }

    [Fact]
    public async Task AiCompletion_HttpThrows_ReturnsNull()
    {
        var svc = Build(new StubHandler(_ => throw new HttpRequestException("network")), Secret(Encrypt("api-key")).Object);
        var result = await svc.AiCompletion(new AiCompletionRequest("m", 0.1));
        result.Should().BeNull();
    }

    [Fact]
    public async Task GenerateRegexPattern_JsonResponse_ReturnsPatternAndError()
    {
        var svc = Build(new StubHandler(_ => Ok("{\"pattern\": \"^\\\\d+$\", \"errorMessage\": \"Digits only\"}")), Secret(Encrypt("api-key")).Object);

        var result = await svc.GenerateRegexPattern(new RegexAssistantRequest
        {
            Description = "digits",
            ExampleText = "123",
            AdditionalContext = "no letters",
            Temperature = 0.1
        });

        result.Should().Be(@"^\d+$");
        svc.GetLastErrorMessage().Should().Be("Digits only");
    }

    [Fact]
    public async Task GenerateRegexPattern_CodeBlockWrapped_Unwraps()
    {
        var svc = Build(new StubHandler(_ => Ok("```regex\n^abc$\n```")), Secret(Encrypt("api-key")).Object);

        var result = await svc.GenerateRegexPattern(new RegexAssistantRequest { Description = "x" });

        result.Should().Be("^abc$");
    }

    [Fact]
    public async Task GenerateRegexPattern_QuotedResponse_StripsQuotes()
    {
        var svc = Build(new StubHandler(_ => Ok("\"^abc$\"")), Secret(Encrypt("api-key")).Object);

        var result = await svc.GenerateRegexPattern(new RegexAssistantRequest { Description = "x", Temperature = 0 });

        result.Should().Be("^abc$");
    }
}
