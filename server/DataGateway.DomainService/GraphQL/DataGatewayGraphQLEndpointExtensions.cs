using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Routing for the multi-tenant data gateway. Every request goes to the same base path
/// (e.g. <c>/api/gateway</c>) and the tenant is resolved per request: from the access token when the
/// request is authenticated, otherwise from the <c>x-blocks-key</c> request header. The tenant id
/// selects the GraphQL schema/executor, so different tenants can expose identically named schemas in
/// complete isolation.
///
/// IMPORTANT: this must be mapped after authentication middleware so the token is available.
/// </summary>
public static class DataGatewayGraphQLEndpointExtensions
{
    public static void MapDataGatewayGraphQL(this WebApplication app, string basePath)
    {
        app.Map(basePath, branch =>
        {
            branch.Run(async context =>
            {
                // /api/gateway is a public endpoint, so the framework does not validate the token for
                // it. Validate it here against the tenant identified by x-blocks-key so an authenticated
                // request gets its ClaimsPrincipal (and the token's tenant) before we resolve the tenant.
                var blocksKey = RequestContextAccessor.Current.BlocksKey;
                if (!string.IsNullOrWhiteSpace(blocksKey))
                {
                    var authenticator = context.RequestServices.GetRequiredService<GatewayTokenAuthenticator>();
                    var principal = await authenticator.GetPrincipalFromTokenAsync(context.Request, blocksKey);
                    if (principal is not null)
                    {
                        context.User = principal;
                    }
                }

                // Token first (authenticated requests), then the x-blocks-key header.
                var tenantId = TenantContext.GetTenantId();
                if (string.IsNullOrWhiteSpace(tenantId))
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        error = $"Unable to resolve tenant. Provide a valid bearer token or the '{GraphQlConstant.BlocksKeyHeaderKey}' header."
                    });
                    return;
                }

                // Pin the resolved tenant for the rest of the request (schema build + data access).
                RequestContextAccessor.Current.TenantId = tenantId;

                var dispatcher = context.RequestServices.GetRequiredService<DataGatewayPipelineDispatcher>();
                var pipeline = dispatcher.GetPipeline(tenantId);
                await pipeline(context);
            });
        });
    }
}
