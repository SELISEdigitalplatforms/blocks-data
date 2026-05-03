using Microsoft.AspNetCore.Http;


namespace DomainService.Storage
{
    public class UploadCertificateRequest
    {
        public IFormFile Certificate { get; set; }
        public string TenantId { get; set; }
        public bool IsThirdParty { get; set; }
    }
}
