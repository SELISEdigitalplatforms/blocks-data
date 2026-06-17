using Blocks.Genesis;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Resolves the tenant (project) being served by the current request.
///
/// Resolution order:
/// 1. If the request is authenticated, use the tenant id carried in the access token
///    (<see cref="BlocksContext.TenantId"/>).
/// 2. Otherwise fall back to the <c>x-blocks-key</c> request header, captured on the request-scoped
///    <see cref="RequestContextAccessor"/> by <c>RequestContextMiddleware</c>.
///
/// The resolved tenant id selects the GraphQL schema/executor and the database for the request, so two
/// tenants can expose identically named schemas in complete isolation.
/// </summary>
public static class TenantContext
{
    public static string GetTenantId()
    {
        var blocksContext = BlocksContext.GetContext();
        if (blocksContext?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(blocksContext.TenantId))
        {
            return blocksContext.TenantId;
        }

        var current = RequestContextAccessor.Current;
        if (!string.IsNullOrWhiteSpace(current.TenantId))
        {
            return current.TenantId!;
        }

        return current.BlocksKey ?? string.Empty;
    }
}
