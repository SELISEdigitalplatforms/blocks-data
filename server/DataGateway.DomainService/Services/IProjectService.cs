using Blocks.Genesis;

namespace DataGateway.DomainService.Services;


public interface IProjectService
{
    Task<string> GetTenantSlugAsync(string tenantId);
    Task<string> GetTenantIdAsync(string tenantSlug);
    Task<List<Tenant>> GetTenantsAsync(string tenantId = "");
}
