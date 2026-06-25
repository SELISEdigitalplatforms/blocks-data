using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;

namespace DataGateway.DomainService.Middlewares;

public class RequestContextMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ITenants _tenants;

    public RequestContextMiddleware(RequestDelegate next, ITenants tenants)
    {
        _next = next;
        _tenants = tenants;
    }

    public async Task InvokeAsync(HttpContext httpContext)
    {
        var request = httpContext.Request;
        var requestUri = request.GetDisplayUrl();
        Console.WriteLine($"Request Path: {request.Path.Value}");
        Console.WriteLine($"Full Request URI: {requestUri}");
        var xBlocksKey = request.Headers[GraphQlConstant.BlocksKeyHeaderKey];
        var tenantId = xBlocksKey.ToString();
        var tenant = _tenants.GetTenantByID(tenantId);
        Console.WriteLine($"Blocks Key: {xBlocksKey}");
        var requestPath = request.Path.Value ?? string.Empty;
        var ctx = new RequestContext
        {
            BlocksKey = tenantId,
            // The tenant served by the request is identified solely by the x-blocks-key header.
            TenantId = tenantId,
            IsRequestFromBlocksCloud = tenant?.IsRootTenant ?? false,
            RequestUri = requestUri,
            RequestPath = requestPath,
            HttpContext = httpContext
        };

        RequestContextAccessor.Current = ctx;

        await _next(httpContext);

    }
}

