using DataGateway.DomainService.GraphQL;
using HotChocolate.Execution;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class SchemaConfigurationService : ISchemaConfigurationService
{
    private readonly GraphqlSchemaBuilder _graphqlSchemaBuilder;
    private readonly ILogger<SchemaConfigurationService> _logger;
    private readonly IRequestExecutorResolver _executorResolver;
    private readonly DataGatewayPipelineDispatcher _pipelineDispatcher;
    private readonly ProjectExecutorOptionsMonitor _optionsMonitor;

    public SchemaConfigurationService(GraphqlSchemaBuilder graphqlSchemaBuilder,
        IRequestExecutorResolver executorResolver,
        DataGatewayPipelineDispatcher pipelineDispatcher,
        ProjectExecutorOptionsMonitor optionsMonitor,
        ILogger<SchemaConfigurationService> logger)
    {
        _executorResolver = executorResolver ?? throw new ArgumentNullException(nameof(executorResolver));
        _graphqlSchemaBuilder = graphqlSchemaBuilder ?? throw new ArgumentNullException(nameof(graphqlSchemaBuilder));
        _pipelineDispatcher = pipelineDispatcher ?? throw new ArgumentNullException(nameof(pipelineDispatcher));
        _optionsMonitor = optionsMonitor ?? throw new ArgumentNullException(nameof(optionsMonitor));
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

    public async Task ReloadAsync(string tenantId, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Reloading schema for tenant: {TenantId}", tenantId);

        var effectiveName = string.IsNullOrWhiteSpace(tenantId) ? Schema.DefaultName : tenantId;

        // Bump the version counter so the next request uses a new schema name (e.g. tenantId@v1).
        // HC has no cache entry for the new name → always builds a fresh executor from MongoDB.
        // This bypasses any unreliability in EvictRequestExecutor for dynamically-created schemas.
        var oldSchemaName = _pipelineDispatcher.BumpVersionAndClearPipeline(effectiveName);

        // Evict old executor via HC's own change-notification path (more reliable than
        // calling IRequestExecutorResolver.EvictRequestExecutor directly).
        _optionsMonitor.TriggerEviction(oldSchemaName);
        _logger.LogInformation("Schema reload complete for tenant: {TenantId}", tenantId);
    }

    public Task RemoveSchemaAsync(string tenantId, CancellationToken cancellationToken)
    {
        var oldSchemaName = _pipelineDispatcher.BumpVersionAndClearPipeline(tenantId);
        _optionsMonitor.TriggerEviction(oldSchemaName);
        return Task.CompletedTask;
    }
}
