using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService;

public class RequestContext
{
    public string BlocksKey { get; set; } = string.Empty;
    public string? TenantSlug { get; set; }
    public string? RequestUri { get; set; }
    public string? RequestPath { get; set; }
    public string? UserId { get; set; }
    public bool IsRequestFromBlocksCloud { get; set; }
    public HttpContext? HttpContext { get; set; }
}
