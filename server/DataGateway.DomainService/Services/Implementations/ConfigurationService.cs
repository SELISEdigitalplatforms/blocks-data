using HotChocolate.Execution;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly GraphqlSchemaBuilder _graphqlSchemaBuilder;
    private readonly ILogger<ConfigurationService> _logger;
    private readonly IRequestExecutorResolver _executorResolver;

    public ConfigurationService(GraphqlSchemaBuilder graphqlSchemaBuilder,
        IRequestExecutorResolver executorResolver, ILogger<ConfigurationService> logger)
    {
        _executorResolver = executorResolver ?? throw new ArgumentNullException(nameof(executorResolver));
        _graphqlSchemaBuilder = graphqlSchemaBuilder ?? throw new ArgumentNullException(nameof(graphqlSchemaBuilder));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<ISchema> BuildSchemaAsync(string tenantId, CancellationToken cancellationToken)
    {
        var builder = SchemaBuilder.New();
        await _graphqlSchemaBuilder.BuildSchema(tenantId, builder, cancellationToken);
        _logger.LogInformation("Schema built for tenant: {TenantId}", tenantId);
        return builder.Create();
    }

    public async Task ConfigureSchemaAsync(string tenantId, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Configuring schema for tenant: {TenantId}", tenantId);
        await _graphqlSchemaBuilder.BuildSchema(tenantId, schemaBuilder, cancellationToken);
        _logger.LogInformation("Schema configured for tenant: {TenantId}", tenantId);
    }

    public Task ReloadAsync(string tenantId, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Reloading schema for tenant: {TenantId}", tenantId);

        // Evict the tenant's executor; HotChocolate rebuilds it (with the latest schema definitions)
        // on the next request for that tenant.
        _executorResolver.EvictRequestExecutor(string.IsNullOrWhiteSpace(tenantId) ? Schema.DefaultName : tenantId);
        _logger.LogInformation("Request executor evicted for tenant: {TenantId}", tenantId);

        return Task.CompletedTask;
    }

    public Task RemoveSchemaAsync(string tenantId, CancellationToken cancellationToken)
    {
        // Evict the executor for this tenant so HotChocolate will remove it.
        _executorResolver.EvictRequestExecutor(tenantId);
        return Task.CompletedTask;
    }
}
