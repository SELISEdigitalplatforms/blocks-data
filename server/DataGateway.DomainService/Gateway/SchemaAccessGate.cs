using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService.Gateway;

public enum SchemaAccessDecision
{
    Allowed,
    InvalidTenant,
    NotAuthenticated
}

/// <summary>
/// The tenant and authentication check every schema field goes through before it runs. It only
/// decides; each transport turns a refusal into its own error.
/// </summary>
public static class SchemaAccessGate
{
    public static SchemaAccessDecision Check(HttpContext? httpContext, SchemaAccessLevel accessLevel)
    {
        if (!IsValidTenant(httpContext))
            return SchemaAccessDecision.InvalidTenant;

        if (accessLevel == SchemaAccessLevel.Public)
            return SchemaAccessDecision.Allowed;

        return IsAuthenticated(httpContext)
            ? SchemaAccessDecision.Allowed
            : SchemaAccessDecision.NotAuthenticated;
    }

    private static bool IsValidTenant(HttpContext? httpContext)
    {
        // if x-blocks-key from header matches with constant tenantid or is a blocks cloud tenant then it's a valid tenant
        var blocksKey = httpContext?.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(blocksKey))
            return false;

        return blocksKey == TenantContext.GetTenantId() || RequestContextAccessor.Current.IsRequestFromBlocksCloud;
    }

    private static bool IsAuthenticated(HttpContext? httpContext)
    {
        if (httpContext is null)
            return false;

        var hasAuthorizationHeader = !string.IsNullOrWhiteSpace(httpContext.Request.Headers.Authorization);
        var hasAuthCookie = HasAuthCookie(httpContext);
        var isUserAuthenticated = httpContext.User?.Identity?.IsAuthenticated ?? false;

        return (hasAuthorizationHeader || hasAuthCookie) && isUserAuthenticated;
    }

    private static bool HasAuthCookie(HttpContext httpContext)
    {
        // Cookie key is always access_token_{x-blocks-key}
        var blocksKey = httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        return !string.IsNullOrWhiteSpace(blocksKey);
    }
}
