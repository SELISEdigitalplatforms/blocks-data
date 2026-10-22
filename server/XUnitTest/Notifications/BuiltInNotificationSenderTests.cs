using Blocks.Genesis;
using DataGateway.DomainService.Notifications;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System.Net;
using System.Text.Json;

namespace XUnitTest.Notifications;

public class BuiltInNotificationSenderTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;
        public List<(Dictionary<string, List<string>> Headers, string Body)> Requests { get; } = [];

        public StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder) => _responder = responder;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add((request.Headers.ToDictionary(h => h.Key, h => h.Value.ToList()),
                await request.Content!.ReadAsStringAsync(cancellationToken)));
            return await _responder(request, cancellationToken);
        }
    }

    private static BuiltInNotificationSender Create(StubHandler handler, string? url = "https://notify.example.com/send", string? salt = "salt-1")
    {
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(() => new HttpClient(handler));
        var settings = new Dictionary<string, string?>();
        if (url is not null) settings[BuiltInNotificationSender.UrlConfigKey] = url;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID(It.IsAny<string>())).Returns(salt is null ? null : new Tenant
        {
            TenantSalt = salt,
            DbConnectionString = "mongodb://localhost:27017",
            JwtTokenParameters = new JwtTokenParameters { PrivateCertificatePassword = "pwd", IssueDate = DateTime.UtcNow },
        });
        var crypto = new Mock<ICryptoService>();
        crypto.Setup(c => c.Hash(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns("hashed-secret");
        return new BuiltInNotificationSender(configuration, factory.Object, tenants.Object, crypto.Object,
            NullLogger<BuiltInNotificationSender>.Instance);
    }

    private static StubHandler Ok() => new((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));

    private static BuiltInNotification Message(IReadOnlyList<string>? users = null) =>
        new("tenant-1", "data-test", users ?? ["user-1"], new { @event = "data-test", title = "t" });

    [Fact]
    public async Task Send_PostsWithTenantKeyAndSecretHeaders()
    {
        var handler = Ok();

        var sent = await Create(handler).SendAsync(Message());

        sent.Should().BeTrue();
        var request = handler.Requests.Single();
        request.Headers["x-blocks-key"].Should().Equal("tenant-1");
        request.Headers["Secret"].Should().Equal("hashed-secret");
    }

    [Fact]
    public async Task Send_BodyCarriesConfigNameRecipientsAndPayloadString()
    {
        var handler = Ok();

        await Create(handler).SendAsync(Message());

        using var body = JsonDocument.Parse(handler.Requests.Single().Body);
        body.RootElement.GetProperty("ConfigurationName").GetString().Should().Be("data-test");
        body.RootElement.GetProperty("UserIds").EnumerateArray().Select(e => e.GetString()).Should().Equal("user-1");
        body.RootElement.GetProperty("SaveDenormalizedPayloadAsAnObject").GetBoolean().Should().BeFalse();
        body.RootElement.GetProperty("ContentAvailable").GetBoolean().Should().BeTrue();
        body.RootElement.GetProperty("DenormalizedPayload").GetString().Should().Contain("data-test");
    }

    [Fact]
    public async Task Send_NeverPutsTheSecretInTheBody()
    {
        var handler = Ok();

        await Create(handler).SendAsync(Message());

        handler.Requests.Single().Body.Should().NotContain("hashed-secret").And.NotContain("salt-1");
    }

    [Fact]
    public async Task Send_SkipsWhenThereIsNoRecipient()
    {
        var handler = Ok();

        var sent = await Create(handler).SendAsync(Message([]));

        sent.Should().BeFalse();
        handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task Send_SkipsWhenTheUrlIsNotConfigured()
    {
        var handler = Ok();

        (await Create(handler, url: null).SendAsync(Message())).Should().BeFalse();
        handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task Send_SkipsWhenTheTenantHasNoSalt()
    {
        var handler = Ok();

        (await Create(handler, salt: null).SendAsync(Message())).Should().BeFalse();
        handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task Send_SwallowsTransportFailures()
    {
        var handler = new StubHandler((_, _) => throw new HttpRequestException("network down"));

        var act = () => Create(handler).SendAsync(Message());

        (await act.Should().NotThrowAsync()).Subject.Should().BeFalse();
    }

    [Fact]
    public async Task Send_ReturnsFalseWhenTheNotifierRejects()
    {
        var handler = new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest)));

        (await Create(handler).SendAsync(Message())).Should().BeFalse();
    }

    [Fact]
    public async Task Send_GivesUpAfterTheTimeout()
    {
        var handler = new StubHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(60), ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var started = DateTime.UtcNow;

        var sent = await Create(handler).SendAsync(Message());

        sent.Should().BeFalse();
        (DateTime.UtcNow - started).Should().BeLessThan(BuiltInNotificationSender.Timeout + TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Recipients_DropsBlanksAndDuplicates()
    {
        BuiltInNotificationSender.Recipients("a", null, "", " ", "a", "b").Should().Equal("a", "b");
    }
}
