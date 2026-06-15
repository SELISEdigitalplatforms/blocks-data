using Blocks.Genesis;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService.Services;

public class RestAccessControlService
{
    public void EnsureAccess(HttpContext httpContext, SchemaAccessLevel accessLevel)
    {
        if (!IsValidTenant(httpContext))
            throw new AccessDeniedException("Tenant is not valid.");

        if (accessLevel == SchemaAccessLevel.Public)
            return;

        if (!IsAuthenticated(httpContext))
            throw new AccessDeniedException("User is not authenticated.");
    }

    // CheckForOwner is a GraphQL scoped context key that is never set in the current codebase.
    // In the REST path it defaults to false. If owner-check logic is added later, implement it here.
    public bool IsOwnerCheckRequired(SchemaDefinitionExtended schema, PolicyOperation operation) => false;

    private static bool IsValidTenant(HttpContext httpContext)
    {
        var blocksKey = httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(blocksKey))
            return false;
        return blocksKey == GraphQlConstant.TenantId || RequestContextAccessor.Current.IsRequestFromBlocksCloud;
    }

    private static bool IsAuthenticated(HttpContext httpContext)
    {
        var hasAuthorizationHeader = !string.IsNullOrWhiteSpace(httpContext.Request.Headers.Authorization);
        var hasAuthCookie = HasAuthCookie(httpContext);
        var isUserAuthenticated = httpContext.User?.Identity?.IsAuthenticated ?? false;
        return (hasAuthorizationHeader || hasAuthCookie) && isUserAuthenticated;
    }

    private static bool HasAuthCookie(HttpContext httpContext)
    {
        var blocksKey = httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        return !string.IsNullOrWhiteSpace(blocksKey);
    }
}
