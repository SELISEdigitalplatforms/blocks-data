using System.Security.Claims;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.Helpers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace DataGateway.DomainService.Gateway;

/// <summary>
/// Works out who is calling the gateway and which tenant they are calling for, the same way for
/// every transport. The gateway path is anonymous in Genesis, so the token is validated here.
/// </summary>
public static class GatewayCallerResolver
{
    /// <summary>
    /// Validates the request's token when it carries a blocks key and, on a valid token, makes the
    /// principal the request's user. Returns whether the caller is authenticated.
    /// </summary>
    public static async Task<bool> AuthenticateAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var blocksKey = RequestContextAccessor.Current.BlocksKey;
        if (string.IsNullOrWhiteSpace(blocksKey))
            return false;

        var authenticator = context.RequestServices.GetRequiredService<DataGatewayTokenAuthenticator>();
        ClaimsPrincipal? principal = await authenticator.GetPrincipalFromTokenAsync(context.Request, blocksKey);
        if (principal is null)
            return false;

        context.User = principal;
        return true;
    }

    /// <summary>
    /// The tenant for this request: the token's tenant when authenticated, otherwise the
    /// <c>x-blocks-key</c> header. Null when neither identifies one.
    /// </summary>
    public static string? ResolveTenantId()
    {
        var tenantId = TenantContext.GetTenantId();
        return string.IsNullOrWhiteSpace(tenantId) ? null : tenantId;
    }
}
