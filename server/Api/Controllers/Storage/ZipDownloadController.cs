using Blocks.Data.Api.Filters;
using Blocks.Genesis;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Storage.DomainService.Storage.ZipDownload;

namespace Api.Controllers
{
    /// <summary>
    /// Downloads a selection of files and folders as one streamed zip, in two calls: an authenticated prepare that
    /// resolves and permission-checks the selection into a single-use ticket, then an anonymous GET (a browser
    /// navigation cannot send a Bearer header) whose only authority is that ticket.
    /// </summary>
    [ApiController]
    [Route("objects")]
    public class ZipDownloadController : ControllerBase
    {
        private readonly IZipDownloadService _zipDownloadService;
        private readonly ILogger<ZipDownloadController> _logger;

        public ZipDownloadController(IZipDownloadService zipDownloadService, ILogger<ZipDownloadController> logger)
        {
            _zipDownloadService = zipDownloadService;
            _logger = logger;
        }

        /// <summary>Resolves the selection into a ticket. 400 carries <c>errors.zip</c> with the reason.</summary>
        [HttpPost("download-zip/prepare")]
        [ProtectedEndPoint("blocks-data::object::download-zip")]
        [ValidateRequest]
        public async Task<IActionResult> Prepare([FromBody] PrepareZipDownloadRequest request)
        {
            var result = await _zipDownloadService.PrepareAsync(request, HttpContext.RequestAborted);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        /// <summary>Streams the ticket's zip. 404 when the ticket is unknown, used, expired or from another tenant.</summary>
        [HttpGet("download-zip")]
        [AllowAnonymous]
        public async Task<IActionResult> Download([FromQuery] string ticket)
        {
            var zipTicket = await _zipDownloadService.TakeTicketAsync(ticket, HttpContext.RequestAborted);
            if (zipTicket is null) return NotFound();

            Response.ContentType = "application/zip";
            Response.Headers[HeaderNames.ContentDisposition] = BuildContentDisposition(zipTicket.ZipName);
            Response.Headers["X-Accel-Buffering"] = "no";
            HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

            try
            {
                await _zipDownloadService.WriteZipAsync(zipTicket, Response.Body, HttpContext.RequestAborted);
            }
            catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
            {
                // The client left; there is nobody to respond to.
            }
            catch (Exception ex) when (Response.HasStarted)
            {
                // Part of the archive is already on the wire. Completing the response would hand the user a
                // truncated zip that looks valid, so reset the connection and let the browser fail the download.
                _logger.LogError(ex, "Zip download aborted after the response started.");
                HttpContext.Abort();
            }

            return new EmptyResult();
        }

        private static string BuildContentDisposition(string zipName)
        {
            var safeName = new string(zipName.Select(c => char.IsControl(c) ? '_' : c).ToArray());
            var asciiFallback = new string(safeName.Select(c => c > 0x7E ? '_' : c).ToArray());

            return new ContentDispositionHeaderValue("attachment")
            {
                FileName = asciiFallback,
                FileNameStar = safeName
            }.ToString();
        }
    }
}
