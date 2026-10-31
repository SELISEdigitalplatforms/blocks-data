using System.Reflection;
using Api.Controllers;
using Blocks.Data.Api.Filters;
using Blocks.Genesis;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Net.Http.Headers;
using Moq;
using Storage.DomainService.Storage.ZipDownload;

namespace XUnitTest.Api;

/// <summary>
/// Unit tests for <see cref="ZipDownloadController"/>: the attribute contract of its two endpoints, the
/// mapping of prepare results onto status codes, and the response headers and failure handling of the stream.
/// </summary>
public class ZipDownloadControllerTests
{
    private readonly Mock<IZipDownloadService> _service = new();
    private readonly ZipDownloadController _sut;
    private readonly DefaultHttpContext _http = new();

    public ZipDownloadControllerTests()
    {
        _sut = new ZipDownloadController(_service.Object, NullLogger<ZipDownloadController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = _http }
        };
    }

    private static ZipTicket Ticket(string zipName = "Docs.zip") => new() { TenantId = "t1", ZipName = zipName };

    /// <summary>A response feature whose HasStarted can be forced, as it is once bytes have been flushed.</summary>
    private sealed class StartedResponseFeature : HttpResponseFeature
    {
        public override bool HasStarted => true;
    }

    private void GivenTicket(ZipTicket ticket) =>
        _service.Setup(s => s.TakeTicketAsync("tk", It.IsAny<CancellationToken>())).ReturnsAsync(ticket);

    [Fact]
    public void Prepare_is_protected_and_validated()
    {
        var action = typeof(ZipDownloadController).GetMethod(nameof(ZipDownloadController.Prepare))!;

        action.GetCustomAttribute<ProtectedEndPointAttribute>()!.ResourceName
            .Should().Be("blocks-data::object::download-zip");
        action.GetCustomAttribute<ValidateRequestAttribute>().Should().NotBeNull();
    }

    [Fact]
    public void Download_allows_anonymous()
    {
        var action = typeof(ZipDownloadController).GetMethod(nameof(ZipDownloadController.Download))!;

        action.GetCustomAttribute<AllowAnonymousAttribute>().Should().NotBeNull();
    }

    [Fact]
    public async Task Prepare_success_is_200_with_the_service_body()
    {
        var request = new PrepareZipDownloadRequest();
        var response = new PrepareZipDownloadResponse { IsSuccess = true, Ticket = "tk", ZipName = "Docs.zip" };
        _service.Setup(s => s.PrepareAsync(request, _http.RequestAborted)).ReturnsAsync(response);

        var result = await _sut.Prepare(request);

        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeSameAs(response);
    }

    [Fact]
    public async Task Prepare_failure_is_400_with_the_service_body()
    {
        var request = new PrepareZipDownloadRequest();
        var response = new PrepareZipDownloadResponse
        {
            Errors = new Dictionary<string, string> { ["zip"] = "zip_limit_exceeded" }
        };
        _service.Setup(s => s.PrepareAsync(request, It.IsAny<CancellationToken>())).ReturnsAsync(response);

        var result = await _sut.Prepare(request);

        result.Should().BeOfType<BadRequestObjectResult>().Which.Value.Should().BeSameAs(response);
    }

    [Fact]
    public async Task Download_unknown_ticket_is_404()
    {
        _service.Setup(s => s.TakeTicketAsync("nope", It.IsAny<CancellationToken>())).ReturnsAsync((ZipTicket?)null);

        var result = await _sut.Download("nope");

        result.Should().BeOfType<NotFoundResult>();
        _service.Verify(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Download_sets_zip_headers_and_streams()
    {
        var ticket = Ticket();
        GivenTicket(ticket);
        var body = new MemoryStream();
        _http.Response.Body = body;
        _service.Setup(s => s.WriteZipAsync(ticket, body, _http.RequestAborted))
            .ReturnsAsync(new ZipWriteResult(1, 0));

        var result = await _sut.Download("tk");

        result.Should().BeOfType<EmptyResult>();
        _http.Response.ContentType.Should().Be("application/zip");
        _http.Response.Headers["X-Accel-Buffering"].ToString().Should().Be("no");
        var disposition = ContentDispositionHeaderValue.Parse(_http.Response.Headers.ContentDisposition.ToString());
        disposition.DispositionType.ToString().Should().Be("attachment");
        disposition.FileName.ToString().Trim('"').Should().Be("Docs.zip");
        _http.Response.Headers.ContentLength.Should().BeNull();
        _service.Verify(s => s.WriteZipAsync(ticket, body, _http.RequestAborted), Times.Once);
    }

    [Fact]
    public async Task Download_disables_response_buffering()
    {
        GivenTicket(Ticket());
        var bodyFeature = new Mock<IHttpResponseBodyFeature>();
        bodyFeature.SetupGet(f => f.Stream).Returns(new MemoryStream());
        _http.Features.Set(bodyFeature.Object);
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ZipWriteResult(0, 0));

        await _sut.Download("tk");

        bodyFeature.Verify(f => f.DisableBuffering(), Times.Once);
    }

    [Fact]
    public async Task Non_ascii_zip_name_gets_filename_star()
    {
        GivenTicket(Ticket("রিপোর্ট.zip"));
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ZipWriteResult(1, 0));

        await _sut.Download("tk");

        var raw = _http.Response.Headers.ContentDisposition.ToString();
        raw.Should().Contain("filename*=UTF-8''%E0%A6");
        var disposition = ContentDispositionHeaderValue.Parse(raw);
        disposition.DispositionType.ToString().Should().Be("attachment");
        disposition.FileName.ToString().Trim('"').Should().MatchRegex("^[\\x20-\\x7E]+$").And.EndWith(".zip");
        disposition.FileNameStar.ToString().Should().Be("রিপোর্ট.zip");
    }

    [Fact]
    public async Task Control_characters_in_the_zip_name_are_replaced_in_the_header()
    {
        GivenTicket(Ticket("a\r\nSet-Cookie: x=1.zip"));
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ZipWriteResult(1, 0));

        await _sut.Download("tk");

        var raw = _http.Response.Headers.ContentDisposition.ToString();
        raw.Should().NotContainAny("\r", "\n");
        var disposition = ContentDispositionHeaderValue.Parse(raw);
        disposition.FileName.ToString().Trim('"').Should().Be("a__Set-Cookie: x=1.zip");
        disposition.FileNameStar.ToString().Should().Be("a__Set-Cookie: x=1.zip");
    }

    [Fact]
    public async Task Copy_failure_aborts_the_connection()
    {
        GivenTicket(Ticket());
        _http.Features.Set<IHttpResponseFeature>(new StartedResponseFeature());
        var lifetime = new Mock<IHttpRequestLifetimeFeature>();
        _http.Features.Set(lifetime.Object);
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ZipEntryCopyException("f1", new IOException("boom")));

        await _sut.Download("tk");

        lifetime.Verify(l => l.Abort(), Times.Once);
    }

    [Fact]
    public async Task Any_failure_after_the_response_started_aborts_the_connection()
    {
        GivenTicket(Ticket());
        _http.Features.Set<IHttpResponseFeature>(new StartedResponseFeature());
        var lifetime = new Mock<IHttpRequestLifetimeFeature>();
        _http.Features.Set(lifetime.Object);
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("client reset"));

        await _sut.Download("tk");

        lifetime.Verify(l => l.Abort(), Times.Once);
    }

    [Fact]
    public async Task Failure_before_the_response_started_is_rethrown()
    {
        GivenTicket(Ticket());
        var lifetime = new Mock<IHttpRequestLifetimeFeature>();
        _http.Features.Set(lifetime.Object);
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("configuration missing"));

        var act = () => _sut.Download("tk");

        await act.Should().ThrowAsync<InvalidOperationException>();
        lifetime.Verify(l => l.Abort(), Times.Never);
    }

    [Fact]
    public async Task Cancellation_by_the_client_returns_quietly()
    {
        GivenTicket(Ticket());
        using var cts = new CancellationTokenSource();
        var lifetime = new Mock<IHttpRequestLifetimeFeature>();
        lifetime.SetupProperty(l => l.RequestAborted, cts.Token);
        _http.Features.Set(lifetime.Object);
        _service.Setup(s => s.WriteZipAsync(It.IsAny<ZipTicket>(), It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .Returns<ZipTicket, Stream, CancellationToken>((_, _, _) =>
            {
                cts.Cancel();
                throw new OperationCanceledException(cts.Token);
            });

        var result = await _sut.Download("tk");

        result.Should().BeOfType<EmptyResult>();
        lifetime.Verify(l => l.Abort(), Times.Never);
    }
}
