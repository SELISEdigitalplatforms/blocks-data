using Blocks.Genesis;
using DomainService.Storage;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Services;

namespace Api.Controllers
{
    [ApiController]
    [Route("[controller]/[action]")]
    [ApiExplorerSettings(IgnoreApi = true)]

    public class CertificateController : ControllerBase
    {
        private readonly IFileManagementService _fileManagementService;

        public CertificateController(IFileManagementService fileManagementService)
        {
            _fileManagementService = fileManagementService;
        }

        [HttpPost]
        [ProtectedEndPoint("blocks-data::upload-certificate")]
        public async Task<IActionResult> UploadCertificate(UploadCertificateRequest uploadCertificateRequest)
        {
            var downloadUrl = await _fileManagementService.UploadPublicCertificateAsync(uploadCertificateRequest);

            return Ok(new { DownloadUrl = downloadUrl });
        }
    }
}
