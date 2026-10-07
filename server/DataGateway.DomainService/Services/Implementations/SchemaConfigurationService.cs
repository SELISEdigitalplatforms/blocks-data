using DataGateway.DomainService.Entities;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using HotChocolate.Execution;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class SchemaConfigurationService : ISchemaConfigurationService
{
    private const string ChangeLogCollectionName = $"{nameof(SchemaChangeLog)}s";

    private readonly GraphqlSchemaBuilder _graphqlSchemaBuilder;
    private readonly IDbRepository _repository;
    private readonly ISchemaVersionStore _versionStore;
    private readonly SchemaVersionTracker _versionTracker;
    private readonly IRequestExecutorResolver _executorResolver;
    private readonly ILogger<SchemaConfigurationService> _logger;

    public SchemaConfigurationService(GraphqlSchemaBuilder graphqlSchemaBuilder,
        IDbRepository repository,
        ISchemaVersionStore versionStore,
        SchemaVersionTracker versionTracker,
        IRequestExecutorResolver executorResolver,
        ILogger<SchemaConfigurationService> logger)
    {
        _graphqlSchemaBuilder = graphqlSchemaBuilder ?? throw new ArgumentNullException(nameof(graphqlSchemaBuilder));
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
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
    /// Publishes the tenant's schema changes to every pod: checks that the definitions build,
    /// raises the tenant's published version, which each pod checks on its next request
    /// (<see cref="SchemaVersionTracker"/>), and rebuilds this pod's executor before returning.
    /// Throws <see cref="SchemaPublishException"/>, and changes nothing, when the definitions do
    /// not build.
    /// </summary>
    public async Task ReloadAsync(string tenantId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            _logger.LogWarning("Schema reload requested without a tenant; evicting the default schema only");
            _executorResolver.EvictRequestExecutor(Schema.DefaultName);
            return;
        }

        _logger.LogInformation("Reloading schema for tenant: {TenantId}", tenantId);

        // Capture the pending changes before raising the version, so a change saved while this
        // runs stays pending instead of being marked as published without having been built.
        var pendingChangeLogIds = await GetUnadaptedChangeLogIdsAsync(tenantId);

        // Refuse a schema that does not build, before any pod is told about it. Otherwise every
        // pod would fail its rebuild and keep serving the previous schema while this reports
        // success.
        await EnsureSchemaBuildsAsync(tenantId, cancellationToken);

        var version = await _versionStore.BumpAsync(tenantId, cancellationToken);

        if (pendingChangeLogIds.Count > 0)
        {
            var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName,
                new BsonDocument("$in", new BsonArray(pendingChangeLogIds)));
            var update = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), true);
            await _repository.UpdateManyAsync(ChangeLogCollectionName, filter, update, tenantId);
        }

        // Wait for this pod's new executor, so the request the client sends right after a publish
        // (it re-reads the schema) gets the new schema rather than the one being replaced.
        var rebuilt = await _versionTracker.RebuildNowAsync(tenantId, version, LocalRebuildTimeout, cancellationToken);
        if (!rebuilt)
        {
            // The definitions built a moment ago, so this is transient; the version is already
            // raised and every pod, this one included, keeps retrying.
            _logger.LogWarning("Published version {Version} for tenant {TenantId}, but this pod had not rebuilt within {Timeout}",
                version, tenantId, LocalRebuildTimeout);
        }

        _logger.LogInformation("Schema reload complete for tenant {TenantId}: published version {Version}", tenantId, version);
    }

    private async Task EnsureSchemaBuildsAsync(string tenantId, CancellationToken cancellationToken)
    {
        try
        {
            var builder = SchemaBuilder.New();
            // A tenant without definitions has nothing to validate (and nothing to serve).
            if (await _graphqlSchemaBuilder.BuildSchema(tenantId, builder, cancellationToken))
            {
                builder.Create();
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Schema for tenant {TenantId} does not build; nothing was published", tenantId);
            throw new SchemaPublishException($"The schema could not be published because it does not build: {ex.Message}", ex);
        }
    }

    public Task RemoveSchemaAsync(string tenantId, CancellationToken cancellationToken)
    {
        _executorResolver.EvictRequestExecutor(tenantId);
        return Task.CompletedTask;
    }

    private async Task<List<string>> GetUnadaptedChangeLogIdsAsync(string tenantId)
    {
        var filter = Builders<SchemaChangeLog>.Filter.Eq(log => log.DoesServerAdaptChanges, false);
        var pending = await _repository.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(filter, null, tenantId);
        return pending.Select(log => log.ItemId).ToList();
    }
}
