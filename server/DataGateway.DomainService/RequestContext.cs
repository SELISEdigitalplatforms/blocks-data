using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService;

public class RequestContext
{
    public string BlocksKey { get; set; } = string.Empty;

    /// <summary>
    /// The tenant id of the project (data gateway) that is currently being served.
    /// It is taken from the <c>x-blocks-key</c> request header and is used to select the correct
    /// GraphQL schema/executor and database for the request in this single-instance, multi-tenant setup.
    /// </summary>
    public string? TenantId { get; set; }
    public string? RequestUri { get; set; }
    public string? RequestPath { get; set; }
    public string? UserId { get; set; }
    public bool IsRequestFromBlocksCloud { get; set; }
    public HttpContext? HttpContext { get; set; }
}
