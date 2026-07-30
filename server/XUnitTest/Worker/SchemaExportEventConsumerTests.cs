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

public class SchemaExportEventConsumerTests
{
    private const string UploadUrl = "https://blob.example.com/upload";
    private const string NotificationUrl = "https://notify.example.com/send";

    /// <summary>
    /// Records each request plus a snapshot of its method, uri, headers and body. The consumer
    /// disposes every request it sends, so the body has to be read here rather than in the test.
    /// </summary>
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
                request.Headers.ToDictionary(h => h.Key, h => h.Value.ToList()),
                request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));

            return _responder(request);
        }
    }

    private sealed record SentRequest(
        HttpMethod Method,
        string Uri,
        Dictionary<string, List<string>> Headers,
        string? Body);

    private sealed class Harness
    {
        public Mock<ISchemaExportService> ExportService { get; } = new();
        public Mock<IFileManagementService> FileManagement { get; } = new();
        public Mock<ICryptoService> Crypto { get; } = new();
        public Mock<ITenants> Tenants { get; } = new();
        public StubHandler Handler { get; }
        public SchemaExportEventConsumer Consumer { get; }

        public Harness(
            Func<HttpRequestMessage, HttpResponseMessage>? responder = null,
            string? notificationUrl = NotificationUrl,
            string? tenantSalt = "salt-1")
        {
            Handler = new StubHandler(responder ?? (_ => new HttpResponseMessage(HttpStatusCode.OK)));

            var factory = new Mock<IHttpClientFactory>();
            factory.Setup(f => f.CreateClient(It.IsAny<string>()))
                   .Returns(() => new HttpClient(Handler));

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

            ExportService.Setup(s => s.BuildExportBytesAsync(It.IsAny<SchemaExportEvent>()))
                         .ReturnsAsync(([1, 2, 3], "export.json"));

            FileManagement.Setup(f => f.GetPerSignedUrlForUploadAsync(It.IsAny<GetPreSignedUrlForUploadRequest>()))
                          .ReturnsAsync(new GetPreSignedUrlForUploadResponse { UploadUrl = UploadUrl });

            Consumer = new SchemaExportEventConsumer(
                ExportService.Object,
                FileManagement.Object,
                Crypto.Object,
                Tenants.Object,
                configuration,
                factory.Object,
                NullLogger<SchemaExportEventConsumer>.Instance);
        }
    }

    /// <summary>
    /// The notification carries its payload as a nested JSON string, so it has to be parsed
    /// twice rather than substring-matched.
    /// </summary>
    private static JsonElement Payload(string? body)
    {
        using var envelope = JsonDocument.Parse(body!);
        var inner = envelope.RootElement.GetProperty("DenormalizedPayload").GetString()!;
        return JsonDocument.Parse(inner).RootElement.Clone();
    }

    private static SchemaExportEvent Event() => new()
    {
        FileId = "file-1",
        ProjectKey = "proj-1",
        MessageCoRelationId = "corr-1",
        CallerUserId = "user-1",
        CallerTenantId = "tenant-1",
    };

    [Fact]
    public async Task Consume_UploadsAndRecordsTheExport()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        h.ExportService.Verify(s => s.BuildExportBytesAsync(It.IsAny<SchemaExportEvent>()), Times.Once);
        h.ExportService.Verify(s => s.InsertExportRecordAsync(It.IsAny<SchemaExportEvent>(), "export.json"), Times.Once);
    }

    [Fact]
    public async Task Consume_PutsTheBytesToThePreSignedUrlAsABlockBlob()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        var upload = h.Handler.Requests.Single(r => r.Method == HttpMethod.Put);
        upload.Uri.Should().Be(UploadUrl);
        upload.Headers["x-ms-blob-type"].Should().ContainSingle().Which.Should().Be("BlockBlob");
    }

    [Fact]
    public async Task Consume_SkipsTheExportRecordWhenNoPreSignedUrlComesBack()
    {
        var h = new Harness();
        h.FileManagement.Setup(f => f.GetPerSignedUrlForUploadAsync(It.IsAny<GetPreSignedUrlForUploadRequest>()))
                        .ReturnsAsync(new GetPreSignedUrlForUploadResponse { UploadUrl = "" });

        await h.Consumer.Consume(Event());

        h.ExportService.Verify(s => s.InsertExportRecordAsync(It.IsAny<SchemaExportEvent>(), It.IsAny<string>()), Times.Never);
        h.Handler.Requests.Should().NotContain(r => r.Method == HttpMethod.Put);
    }

    [Fact]
    public async Task Consume_SkipsTheExportRecordWhenTheUploadFails()
    {
        var h = new Harness(r => new HttpResponseMessage(
            r.Method == HttpMethod.Put ? HttpStatusCode.Forbidden : HttpStatusCode.OK));

        await h.Consumer.Consume(Event());

        h.ExportService.Verify(s => s.InsertExportRecordAsync(It.IsAny<SchemaExportEvent>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Consume_StillNotifiesWhenBuildingTheExportThrows()
    {
        var h = new Harness();
        h.ExportService.Setup(s => s.BuildExportBytesAsync(It.IsAny<SchemaExportEvent>()))
                       .ThrowsAsync(new InvalidOperationException("boom"));

        await h.Consumer.Consume(Event());

        var notification = h.Handler.Requests.Single(r => r.Method == HttpMethod.Post);
        Payload(notification.Body).GetProperty("IsSuccess").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Consume_NotifiesSuccessWithTheTenantKeyAndSecretHeaders()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        var notification = h.Handler.Requests.Single(r => r.Method == HttpMethod.Post);
        notification.Uri.Should().Be(NotificationUrl);
        notification.Headers["x-blocks-key"].Should().ContainSingle().Which.Should().Be("tenant-1");
        notification.Headers["Secret"].Should().ContainSingle().Which.Should().Be("hashed-secret");
        var payload = Payload(notification.Body);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeTrue();
        payload.GetProperty("FileId").GetString().Should().Be("file-1");
        payload.GetProperty("title").GetString().Should().Be("Schema Export Completed");
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
            : new HttpResponseMessage(HttpStatusCode.OK));

        var act = () => h.Consumer.Consume(Event());

        await act.Should().NotThrowAsync();
        h.ExportService.Verify(s => s.InsertExportRecordAsync(It.IsAny<SchemaExportEvent>(), "export.json"), Times.Once);
    }

    [Fact]
    public async Task Consume_LogsButDoesNotThrowWhenTheNotificationIsRejected()
    {
        var h = new Harness(r => new HttpResponseMessage(
            r.Method == HttpMethod.Post ? HttpStatusCode.BadRequest : HttpStatusCode.OK));

        var act = () => h.Consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }
}
