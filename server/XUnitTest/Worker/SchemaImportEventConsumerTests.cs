using Blocks.Genesis;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using DomainService.Storage;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Storage.DomainService.Services;
using System.Net;
using System.Text.Json;
using Worker.Consumers;

namespace XUnitTest.Worker;

public class SchemaImportEventConsumerTests
{
    private const string DownloadUrl = "https://blob.example.com/schema.json";
    private const string NotificationUrl = "https://notify.example.com/send";

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        public List<SentRequest> Requests { get; } = [];

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new SentRequest(
                request.Method,
                request.RequestUri!.ToString(),
                request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));

            return _responder(request);
        }
    }

    private sealed record SentRequest(HttpMethod Method, string Uri, string? Body);

    private sealed class Harness
    {
        public Mock<ISchemaImportService> ImportService { get; } = new();
        public Mock<IFileManagementService> FileManagement { get; } = new();
        public Mock<ICryptoService> Crypto { get; } = new();
        public Mock<ITenants> Tenants { get; } = new();
        public StubHandler Handler { get; }
        public SchemaImportEventConsumer Consumer { get; }

        public Harness(
            Func<HttpRequestMessage, HttpResponseMessage>? responder = null,
            string? notificationUrl = NotificationUrl,
            string? tenantSalt = "salt-1")
        {
            Handler = new StubHandler(responder ?? (_ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent([1, 2, 3]),
            }));

            var factory = new Mock<IHttpClientFactory>();
            factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(() => new HttpClient(Handler));

            var settings = new Dictionary<string, string?>();
            if (notificationUrl is not null)
                settings["NotificationServiceUrl"] = notificationUrl;
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

            Tenants.Setup(t => t.GetTenantByID(It.IsAny<string>()))
                   .Returns(tenantSalt is null
                       ? null
                       : new Tenant
                       {
                           TenantSalt = tenantSalt,
                           DbConnectionString = "mongodb://localhost:27017",
                           JwtTokenParameters = new JwtTokenParameters
                           {
                               PrivateCertificatePassword = "pwd",
                               IssueDate = DateTime.UtcNow,
                           },
                       });

            Crypto.Setup(c => c.Hash(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>()))
                  .Returns("hashed-secret");

            FileManagement.Setup(f => f.GetUrlForDownloadFileAsync(It.IsAny<GetFileRequest>()))
                          .ReturnsAsync(new FileResponse { Url = DownloadUrl, Name = "schema.json" });

            ImportService.Setup(s => s.ProcessImportAsync(It.IsAny<SchemaImportEvent>(), It.IsAny<byte[]>()))
                         .ReturnsAsync(4);

            Consumer = new SchemaImportEventConsumer(
                ImportService.Object,
                FileManagement.Object,
                Crypto.Object,
                Tenants.Object,
                configuration,
                factory.Object,
                NullLogger<SchemaImportEventConsumer>.Instance);
        }
    }

    private static JsonElement Payload(string? body)
    {
        using var envelope = JsonDocument.Parse(body!);
        var inner = envelope.RootElement.GetProperty("DenormalizedPayload").GetString()!;
        return JsonDocument.Parse(inner).RootElement.Clone();
    }

    private static SchemaImportEvent Event() => new()
    {
        FileId = "file-1",
        ProjectKey = "proj-1",
        MessageCoRelationId = "corr-1",
        CallerUserId = "user-1",
        CallerTenantId = "tenant-1",
    };

    [Fact]
    public async Task Consume_DownloadsTheFileAndHandsTheBytesToTheImportService()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        h.Handler.Requests.Should().Contain(r => r.Uri == DownloadUrl);
        h.ImportService.Verify(s => s.ProcessImportAsync(
            It.IsAny<SchemaImportEvent>(),
            It.Is<byte[]>(b => b.Length == 3)), Times.Once);
    }

    [Fact]
    public async Task Consume_ReportsTheImportedCountOnSuccess()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        var payload = Payload(h.Handler.Requests.Single(r => r.Method == HttpMethod.Post).Body);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeTrue();
        payload.GetProperty("ImportedSchemaCount").GetInt32().Should().Be(4);
        payload.GetProperty("title").GetString().Should().Be("Schema Import Completed");
    }

    [Fact]
    public async Task Consume_NotifiesFailureWhenStorageHasNoUrlForTheFile()
    {
        var h = new Harness();
        h.FileManagement.Setup(f => f.GetUrlForDownloadFileAsync(It.IsAny<GetFileRequest>()))
                        .ReturnsAsync(new FileResponse { Url = "", Name = "schema.json" });

        await h.Consumer.Consume(Event());

        h.ImportService.Verify(s => s.ProcessImportAsync(It.IsAny<SchemaImportEvent>(), It.IsAny<byte[]>()), Times.Never);
        var payload = Payload(h.Handler.Requests.Single(r => r.Method == HttpMethod.Post).Body);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeFalse();
        payload.GetProperty("ImportedSchemaCount").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Consume_NotifiesFailureWhenTheFileIsMissingEntirely()
    {
        var h = new Harness();
        h.FileManagement.Setup(f => f.GetUrlForDownloadFileAsync(It.IsAny<GetFileRequest>()))
                        .ReturnsAsync((FileResponse?)null);

        await h.Consumer.Consume(Event());

        var payload = Payload(h.Handler.Requests.Single(r => r.Method == HttpMethod.Post).Body);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Consume_NotifiesFailureWhenTheImportServiceThrows()
    {
        var h = new Harness();
        h.ImportService.Setup(s => s.ProcessImportAsync(It.IsAny<SchemaImportEvent>(), It.IsAny<byte[]>()))
                       .ThrowsAsync(new InvalidOperationException("bad schema"));

        await h.Consumer.Consume(Event());

        var payload = Payload(h.Handler.Requests.Single(r => r.Method == HttpMethod.Post).Body);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Consume_SkipsTheNotificationWhenTheUrlIsNotConfigured()
    {
        var h = new Harness(notificationUrl: null);

        await h.Consumer.Consume(Event());

        h.Handler.Requests.Should().NotContain(r => r.Method == HttpMethod.Post);
    }

    [Fact]
    public async Task Consume_SkipsTheNotificationWhenTheTenantHasNoSalt()
    {
        var h = new Harness(tenantSalt: null);

        await h.Consumer.Consume(Event());

        h.Handler.Requests.Should().NotContain(r => r.Method == HttpMethod.Post);
    }

    [Fact]
    public async Task Consume_SwallowsNotificationTransportFailures()
    {
        var h = new Harness(r => r.Method == HttpMethod.Post
            ? throw new HttpRequestException("network down")
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) });

        var act = () => h.Consumer.Consume(Event());

        await act.Should().NotThrowAsync();
        h.ImportService.Verify(s => s.ProcessImportAsync(It.IsAny<SchemaImportEvent>(), It.IsAny<byte[]>()), Times.Once);
    }

    [Fact]
    public async Task Consume_DoesNotThrowWhenTheNotificationIsRejected()
    {
        var h = new Harness(r => r.Method == HttpMethod.Post
            ? new HttpResponseMessage(HttpStatusCode.BadRequest)
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) });

        var act = () => h.Consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }
}
