using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using Microsoft.Extensions.Logging;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Services;

public class ProjectService : IProjectService
{
    private readonly ITenants _tenants;
    private readonly IDbRepository _repository;
    private readonly ILogger<ProjectService> _logger;

    public ProjectService(ITenants tenants, IDbRepository repository, ILogger<ProjectService> logger)
    {
        _tenants = tenants ?? throw new ArgumentNullException(nameof(tenants));
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }
    public async Task<List<Tenant>> GetTenantsAsync(string tenantId = "")
    {
        var filter = new BsonDocument();
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter.Add(nameof(Tenant.TenantId), tenantId);
        }
        var tenants = await _repository.GetItemsAsync($"{nameof(Tenant)}s", filter, null, null, 0, 1000, GraphQlConstant.BlocksRootDbName);
        return tenants.Select(doc => BsonSerializer.Deserialize<Tenant>(doc)).ToList();
    }
    public async Task<string> GetTenantSlugAsync(string tenantId)
    {
        try
        {
            var tenant = _tenants.GetTenantByID(tenantId);
            if (tenant == null)
            {
                return string.Empty;
            }
            var filter = new BsonDocument
            {
                { nameof(BlocksGuid.TenantGroupId), tenant.TenantGroupId }
            };
            var blocksGuid = await _repository.GetItemAsync($"{nameof(BlocksGuid)}s", filter, GraphQlConstant.BlocksRootDbName);
            if (blocksGuid == null)
            {
                return string.Empty;
            }
            var projectShortKey = blocksGuid.GetValue(nameof(BlocksGuid.EncodedValue), string.Empty).AsString;

            return tenant.GetProjectShortKey(projectShortKey);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting project short key for project key: {ProjectKey}", tenantId);
            return string.Empty;
        }
    }

    public async Task<string> GetTenantIdAsync(string tenantSlug)
    {
        Console.WriteLine($"Tenant Slug: {tenantSlug}");
        var envShortKey = tenantSlug.Substring(0, 1);
        var env = TenantHelper.GetEnvFromShortKey(envShortKey);
        var envTenantSlug = tenantSlug.Substring(1);
        Console.WriteLine($"Env Short Key: {envShortKey}");
        Console.WriteLine($"Env: {env}");
        Console.WriteLine($"Env Tenant Slug: {envTenantSlug}");
        try
        {
            var filter = new BsonDocument
            {
                { nameof(BlocksGuid.EncodedValue), envTenantSlug }
            };
            var blocksGuid = await _repository.GetItemAsync($"{nameof(BlocksGuid)}s", filter, GraphQlConstant.BlocksRootDbName);
            if (blocksGuid == null)
            {
                return string.Empty;
            }
            var tenantGroupId = blocksGuid.GetValue(nameof(BlocksGuid.TenantGroupId), string.Empty).AsString;
            var tenantFilter = new BsonDocument
            {
                { nameof(Tenant.TenantGroupId), tenantGroupId },
                { nameof(Tenant.Environment), env }
            };
            var tenant = await _repository.GetItemAsync($"{nameof(Tenant)}s", tenantFilter, GraphQlConstant.BlocksRootDbName);
            if (tenant == null)
            {
                return string.Empty;
            }
            var tenantId = tenant.GetValue(nameof(Tenant.TenantId), string.Empty).AsString;
            _logger.LogInformation("Tenant id: {TenantId} found for tenant slug: {TenantSlug}", tenantId, tenantSlug);
            return tenantId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tenant id for tenant slug: {TenantSlug}", tenantSlug);
            return string.Empty;
        }
    }
}
