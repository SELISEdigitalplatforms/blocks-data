using Blocks.Genesis;
using Blocks.Genesis.Notifications;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Services;
using DomainService.Storage;
using FluentAssertions;
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
        public List<NotificationRequest> Published { get; } = [];
        public StubHandler Handler { get; }
        public SchemaExportEventConsumer Consumer { get; }

        public Harness(
            Func<HttpRequestMessage, HttpResponseMessage>? responder = null)
        {
            Handler = new StubHandler(responder ?? (_ => new HttpResponseMessage(HttpStatusCode.OK)));

            var factory = new Mock<IHttpClientFactory>();
            factory.Setup(f => f.CreateClient(It.IsAny<string>()))
                   .Returns(() => new HttpClient(Handler));

            var publisher = new Mock<INotificationPublisher>();
            publisher.Setup(p => p.Publish(It.IsAny<NotificationRequest>())).Callback<NotificationRequest>(Published.Add);

            ExportService.Setup(s => s.BuildExportBytesAsync(It.IsAny<SchemaExportEvent>()))
                         .ReturnsAsync(([1, 2, 3], "export.json"));

            FileManagement.Setup(f => f.GetPerSignedUrlForUploadAsync(It.IsAny<GetPreSignedUrlForUploadRequest>()))
                          .ReturnsAsync(new GetPreSignedUrlForUploadResponse { UploadUrl = UploadUrl });

            Consumer = new SchemaExportEventConsumer(
                ExportService.Object,
                FileManagement.Object,
                new BuiltInNotificationSender(publisher.Object),
                factory.Object,
                NullLogger<SchemaExportEventConsumer>.Instance);
        }
    }

    /// <summary>
    /// The notification carries its payload as a nested JSON string, so it has to be parsed
    /// twice rather than substring-matched.
    /// </summary>
    private static JsonElement Payload(NotificationRequest request) =>
        JsonDocument.Parse(JsonSerializer.Serialize(request.Payload)).RootElement.Clone();

    private static SchemaExportEvent Event() => new()
    {
        FileId = "file-1",
        ProjectKey = "proj-1",
        MessageCoRelationId = "corr-1",
        CallerUserId = "user-1",
        CallerTenantId = "tenant-1",
        CallerOrganizationId = "org-1",
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

        Payload(h.Published.Single()).GetProperty("IsSuccess").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Consume_NotifiesSuccessToTheCallerInTheirTenantAndOrganization()
    {
        var h = new Harness();

        await h.Consumer.Consume(Event());

        var notification = h.Published.Single();
        notification.Name.Should().Be("schema-export");
        notification.TenantId.Should().Be("tenant-1");
        notification.OrganizationId.Should().Be("org-1");
        notification.NamedUserIds.Should().Equal("user-1");
        notification.ResponseKey.Should().Be("corr-1");
        var payload = Payload(notification);
        payload.GetProperty("IsSuccess").GetBoolean().Should().BeTrue();
        payload.GetProperty("FileId").GetString().Should().Be("file-1");
        payload.GetProperty("title").GetString().Should().Be("Schema Export Completed");
    }
}
