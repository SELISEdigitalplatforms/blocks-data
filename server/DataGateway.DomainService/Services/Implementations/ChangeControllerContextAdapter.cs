using Blocks.Genesis;
using Microsoft.AspNetCore.Http;
using MongoDB.Bson;
using MongoDB.Driver;
using OpenTelemetry;

namespace DataGateway.DomainService.Services;

public class ChangeControllerContextAdapter : ChangeControllerContext
{
    private readonly ITenants _tenants;

    public ChangeControllerContextAdapter(ITenants tenants, IDbContextProvider dbContextProvider, IHttpContextAccessor httpContextAccessor) : base(tenants, dbContextProvider, httpContextAccessor)
    {
        _tenants = tenants;
    }

    public void ChangeToAnyContext(IProjectKey projectKey)
    {
        BlocksContext context = BlocksContext.GetContext();
        Baggage.SetBaggage("ActualTenantId", context?.TenantId ?? "", default(Baggage));
        if (!string.IsNullOrWhiteSpace(projectKey.ProjectKey) && (projectKey.ProjectKey != context?.TenantId))
        {
            Tenant? tenantByID2 = _tenants.GetTenantByID(context?.TenantId);
            if (tenantByID2 != null && tenantByID2.IsRootTenant)
            {
                BlocksContext.SetContext(
                    BlocksContext.Create(
                        projectKey.ProjectKey
                        , context?.Roles ?? Enumerable.Empty<string>()
                        , context?.UserId ?? string.Empty
                        , context?.IsAuthenticated ?? false
                        , context?.RequestUri ?? string.Empty
                        , context?.OrganizationId ?? string.Empty
                        , context?.ExpireOn ?? DateTime.UtcNow.AddHours(1.0)
                        , context?.Email ?? string.Empty
                        , context?.Permissions ?? Enumerable.Empty<string>()
                        , context?.UserName ?? string.Empty
                        , context?.PhoneNumber ?? string.Empty
                        , context?.DisplayName ?? string.Empty
                        , context?.OAuthToken ?? string.Empty
                        , context?.RefreshToken ?? string.Empty
                        , context?.TenantId ?? string.Empty));
                Baggage.SetBaggage("TenantId", projectKey.ProjectKey, default(Baggage));
            }
        }
    }
}
