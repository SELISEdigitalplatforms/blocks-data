using DataGateway.DomainService.GraphQL;
using HotChocolate.Execution;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class SchemaConfigurationService : ISchemaConfigurationService
{
    private readonly GraphqlSchemaBuilder _graphqlSchemaBuilder;
    private readonly ISchemaPublishService _publishService;
    private readonly SchemaVersionTracker _versionTracker;
    private readonly IRequestExecutorResolver _executorResolver;
    private readonly ILogger<SchemaConfigurationService> _logger;

    public SchemaConfigurationService(GraphqlSchemaBuilder graphqlSchemaBuilder,
        ISchemaPublishService publishService,
        SchemaVersionTracker versionTracker,
        IRequestExecutorResolver executorResolver,
        ILogger<SchemaConfigurationService> logger)
    {
        _graphqlSchemaBuilder = graphqlSchemaBuilder ?? throw new ArgumentNullException(nameof(graphqlSchemaBuilder));
        _publishService = publishService ?? throw new ArgumentNullException(nameof(publishService));
        _versionTracker = versionTracker ?? throw new ArgumentNullException(nameof(versionTracker));
        _executorResolver = executorResolver ?? throw new ArgumentNullException(nameof(executorResolver));
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

    /// <summary>How long a reload waits for this pod's executor to be rebuilt before returning.</summary>
    public static readonly TimeSpan LocalRebuildTimeout = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Publishes the tenant's drafts (<see cref="ISchemaPublishService.PublishAsync"/>): every pod
    /// then serves the new version, and this pod's executor is rebuilt before returning. Throws
    /// <see cref="SchemaPublishException"/>, and changes nothing, when the drafts do not build.
    /// Returns null for a blank tenant.
    /// </summary>
    public async Task<SchemaPublishResult?> ReloadAsync(string tenantId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            _logger.LogWarning("Schema reload requested without a tenant; evicting the default schema only");
            _executorResolver.EvictRequestExecutor(Schema.DefaultName);
            return null;
        }

        _logger.LogInformation("Reloading schema for tenant: {TenantId}", tenantId);
        var result = await _publishService.PublishAsync(tenantId, cancellationToken);

        // Wait for this pod's new executor, so the request the client sends right after a publish
        // (it re-reads the schema) gets the new schema rather than the one being replaced. Other
        // pods rebuild in parallel, on the announcement.
        var rebuilt = await _versionTracker.RebuildNowAsync(tenantId, result.Version, LocalRebuildTimeout, cancellationToken);
        if (!rebuilt)
        {
            // The snapshot built a moment ago, so this is transient; the version is already live
            // and every pod, this one included, keeps retrying.
            _logger.LogWarning("Published version {Version} for tenant {TenantId}, but this pod had not rebuilt within {Timeout}",
                result.Version, tenantId, LocalRebuildTimeout);
        }

        _logger.LogInformation("Schema reload complete for tenant {TenantId}: published version {Version}", tenantId, result.Version);
        return result;
    }

    public Task RemoveSchemaAsync(string tenantId, CancellationToken cancellationToken)
    {
        _executorResolver.EvictRequestExecutor(tenantId);
        return Task.CompletedTask;
    }
}
