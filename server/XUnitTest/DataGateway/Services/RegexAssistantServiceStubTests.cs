using System.Diagnostics.Metrics;
using System.Security.Cryptography;
using System.Text;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Services.RegexAssistant;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using XUnitTest.TestDoubles;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// I02-WP6: the regex assistant calls the model through Genesis's <c>IChatCompletionClient</c>. These tests run it
/// against the scripted OpenAI / Azure-format stub (a local HTTP listener), so no real model is called (rule 13).
/// </summary>
public class RegexAssistantServiceStubTests
{
    private const string Key = "super-secret-key";
    private const string PlainApiKey = "fake-api-key-not-a-secret";
    private static readonly byte[] Salt = Enumerable.Range(1, 16).Select(i => (byte)i).ToArray();

    private static string Encrypt(string plainText)
    {
        using var aes = Aes.Create();
        var kdf = new Rfc2898DeriveBytes(Key, Salt);
        aes.Key = kdf.GetBytes(aes.KeySize / 8);
        aes.IV = kdf.GetBytes(aes.BlockSize / 8);
        using var enc = aes.CreateEncryptor(aes.Key, aes.IV);
        var bytes = Encoding.UTF8.GetBytes(plainText);
        return Convert.ToBase64String(enc.TransformFinalBlock(bytes, 0, bytes.Length));
    }

    private static RegexAssistantService Build(ScriptedChatStub stub, Dictionary<string, string?>? extra = null, bool encryptedLegacyKey = true)
    {
        var settings = new Dictionary<string, string?> { ["AiCompletionUrl"] = stub.BaseUrl + "/v1/chat/completions" };
        for (var i = 0; i < Salt.Length; i++)
            settings[$"Salt:{i}"] = Salt[i].ToString();
        foreach (var pair in extra ?? new())
            settings[pair.Key] = pair.Value;

        var secret = new Mock<ICloudBuildSecret>();
        secret.SetupGet(s => s.ChatGptEncryptedSecret).Returns(encryptedLegacyKey ? Encrypt(PlainApiKey) : null);
        secret.SetupGet(s => s.ChatGptEncryptionKey).Returns(Key);

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new RegexAssistantService(NullLogger<RegexAssistantService>.Instance, configuration, new HttpClient(), secret.Object);
    }

    [Fact]
    public async Task Legacy_settings_send_a_bearer_key_the_legacy_default_model_and_the_system_prompt()
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Completion("^abc$"));

        var result = await Build(stub).AiCompletion(new AiCompletionRequest("only letters", 0.3));

        result.Should().Be("^abc$");
        var request = stub.Requests.Should().ContainSingle().Subject;
        request.Path.Should().Be("/v1/chat/completions");
        request.Headers["authorization"].Should().Be("Bearer " + PlainApiKey);
        request.Headers.Should().NotContainKey("api-key");
        request.Json.GetProperty("model").GetString().Should().Be(RegexAssistantService.LegacyDefaultModel);
        request.Json.GetProperty("temperature").GetDouble().Should().Be(0.3);
        var messages = request.Json.GetProperty("messages");
        messages[0].GetProperty("content").GetString().Should().Contain("regex pattern expert");
        messages[1].GetProperty("content").GetString().Should().Be("only letters");
    }

    [Fact]
    public async Task The_model_comes_from_the_Ai_section_when_set()
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Completion("^x$"));

        await Build(stub, new() { ["Ai:Model"] = "configured-model" }).AiCompletion(new AiCompletionRequest("m", 0.1));

        stub.Requests.Single().Json.GetProperty("model").GetString().Should().Be("configured-model");
    }

    [Fact]
    public async Task The_Ai_section_selects_azure_style_and_a_referenced_key()
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Completion("^x$"));
        var extra = new Dictionary<string, string?>
        {
            ["Ai:Provider"] = "AzureOpenAi",
            ["Ai:Endpoint"] = stub.BaseUrl + "/openai/deployments/d/chat/completions?api-version=2024-10-21",
            ["Ai:ApiKeyReference"] = "Vault:AiKey",
            ["Vault:AiKey"] = PlainApiKey
        };

        var result = await Build(stub, extra, encryptedLegacyKey: false).AiCompletion(new AiCompletionRequest("m", 0.1));

        result.Should().Be("^x$");
        var request = stub.Requests.Single();
        request.Path.Should().Be("/openai/deployments/d/chat/completions");
        request.Headers["api-key"].Should().Be(PlainApiKey);
        request.Headers.Should().NotContainKey("authorization");
    }

    [Theory]
    [InlineData(401)]
    [InlineData(429)]
    [InlineData(500)]
    public async Task An_error_response_gives_null(int status)
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Error(status));

        (await Build(stub).AiCompletion(new AiCompletionRequest("m", 0.1))).Should().BeNull();
    }

    [Fact]
    public async Task GenerateRegexPattern_returns_the_pattern_and_error_message_from_a_json_reply()
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Completion("{\"pattern\":\"^\\\\d{3}$\",\"errorMessage\":\"Enter three digits\"}"));
        var service = Build(stub);

        var pattern = await service.GenerateRegexPattern(new RegexAssistantRequest { Description = "three digits" });

        pattern.Should().Be("^\\d{3}$");
        service.GetLastErrorMessage().Should().Be("Enter three digits");
        stub.Requests.Single().Json.GetProperty("messages")[1].GetProperty("content").GetString().Should().Contain("three digits");
    }

    [Fact]
    public async Task GenerateRegexPattern_retries_after_a_failed_call_and_uses_the_next_reply()
    {
        using var stub = new ScriptedChatStub(ScriptedChatStub.Error(500), ScriptedChatStub.Completion("^ok$"));

        var pattern = await Build(stub).GenerateRegexPattern(new RegexAssistantRequest { Description = "ok" });

        pattern.Should().Be("^ok$");
        stub.Requests.Should().HaveCount(2);
    }

    [Fact]
    public async Task Token_usage_of_each_response_is_recorded_as_a_metric()
    {
        var model = "regex-metric-model-" + Guid.NewGuid().ToString("N");
        long prompt = 0, completion = 0;
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (instrument.Meter.Name == "blocks.genesis.ai")
                l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            if (instrument.Name != "blocks.genesis.ai.tokens")
                return;
            var t = tags.ToArray().ToDictionary(x => x.Key, x => x.Value?.ToString());
            if (t["model"] != model)
                return;
            if (t["token_type"] == "prompt") Interlocked.Add(ref prompt, value);
            else if (t["token_type"] == "completion") Interlocked.Add(ref completion, value);
        });
        listener.Start();
        using var stub = new ScriptedChatStub(ScriptedChatStub.Completion("^x$", 40, 9, model));

        await Build(stub).AiCompletion(new AiCompletionRequest("m", 0.1));

        prompt.Should().Be(40);
        completion.Should().Be(9);
    }
}
