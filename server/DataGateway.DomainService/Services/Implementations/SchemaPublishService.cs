using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using HotChocolate;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class SchemaPublishService : ISchemaPublishService
{
    /// <summary>How many published versions are kept to roll back to (the live one is always kept).</summary>
    public const int KeptVersions = 10;

    private const string ChangeLogCollectionName = $"{nameof(SchemaChangeLog)}s";

    private readonly GraphqlSchemaBuilder _schemaBuilder;
    private readonly ISchemaSnapshotStore _snapshotStore;
    private readonly ISchemaVersionStore _versionStore;
    private readonly IDbRepository _repository;
    private readonly ILogger<SchemaPublishService> _logger;

    public SchemaPublishService(
        GraphqlSchemaBuilder schemaBuilder,
        ISchemaSnapshotStore snapshotStore,
        ISchemaVersionStore versionStore,
        IDbRepository repository,
        ILogger<SchemaPublishService> logger)
    {
        _schemaBuilder = schemaBuilder ?? throw new ArgumentNullException(nameof(schemaBuilder));
        _snapshotStore = snapshotStore ?? throw new ArgumentNullException(nameof(snapshotStore));
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<SchemaPublishResult> PublishAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        // Capture the pending changes first: a change saved while this runs may not be in the
        // drafts read below, so it must stay pending.
        var pendingChangeLogIds = await GetUnadaptedChangeLogIdsAsync(tenantId);

        var source = await _schemaBuilder.ReadDraftSourceAsync(tenantId);

        // Pack before building: building modifies the definitions, and the snapshot must hold
        // exactly what was read. What is stored is then what was validated.
        var content = SchemaSnapshotStore.Pack(source);
        EnsureBuilds(tenantId, source);

        var version = await _versionStore.AllocateAsync(tenantId, cancellationToken);
        await _snapshotStore.SaveAsync(tenantId, version, content, SchemaSnapshotKind.Publish, pendingChangeLogIds, cancellationToken);
        await _versionStore.MakeCurrentAsync(tenantId, version, cancellationToken);

        if (pendingChangeLogIds.Count > 0)
        {
            var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName,
                new BsonDocument("$in", new BsonArray(pendingChangeLogIds)));
            var update = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), true);
            await _repository.UpdateManyAsync(ChangeLogCollectionName, filter, update, tenantId);
        }

        await _versionStore.AnnounceAsync(tenantId, version);
        await PruneAsync(tenantId, version, cancellationToken);

        _logger.LogInformation("Published schema version {Version} for tenant {TenantId} ({SchemaCount} schemas, {ChangeCount} changes)",
            version, tenantId, content.SchemaCount, pendingChangeLogIds.Count);
        return new SchemaPublishResult(version, pendingChangeLogIds.Count);
    }

    public async Task<SchemaRollbackResult> RollbackAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        if (!await _snapshotStore.ExistsAsync(tenantId, version, cancellationToken))
        {
            throw new SchemaVersionNotFoundException(version);
        }

        var previousVersion = await _versionStore.GetAsync(tenantId, cancellationToken);
        if (previousVersion == version)
        {
            return new SchemaRollbackResult(version, previousVersion);
        }

        await _versionStore.SetCurrentAsync(tenantId, version, cancellationToken);
        await _versionStore.AnnounceAsync(tenantId, version);

        _logger.LogInformation("Rolled back the schema for tenant {TenantId} from version {PreviousVersion} to {Version}",
            tenantId, previousVersion, version);
        return new SchemaRollbackResult(version, previousVersion);
    }

    public async Task<SchemaVersionHistory> GetHistoryAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var currentVersion = await _versionStore.GetAsync(tenantId, cancellationToken);
        var snapshots = await _snapshotStore.ListAsync(tenantId, KeptVersions, cancellationToken);

        var versions = snapshots
            .Select(s => new SchemaVersionSummary(
                s.Version,
                s.Kind.ToString(),
                s.PublishedDate,
                s.PublishedByName,
                s.ChangeLogIds.Count,
                s.SchemaCount,
                s.Version == currentVersion))
            .ToList();
        return new SchemaVersionHistory(currentVersion, versions);
    }

    public async Task<(long Version, SchemaSource Source)> BootstrapAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var source = await _schemaBuilder.ReadDraftSourceAsync(tenantId);
        var content = SchemaSnapshotStore.Pack(source);

        var version = await _versionStore.AllocateAsync(tenantId, cancellationToken);
        await _snapshotStore.SaveAsync(tenantId, version, content, SchemaSnapshotKind.Bootstrap, [], cancellationToken);

        // Pods that bootstrap at the same moment each store a copy of the same drafts; the highest
        // version wins and the others are never served.
        var currentVersion = await _versionStore.MakeCurrentAsync(tenantId, version, cancellationToken);
        await _versionStore.AnnounceAsync(tenantId, currentVersion);
        await PruneAsync(tenantId, currentVersion, cancellationToken);

        _logger.LogInformation("Created first published schema version {Version} for tenant {TenantId} from its drafts",
            version, tenantId);
        return (version, source);
    }

    private async Task PruneAsync(string tenantId, long liveVersion, CancellationToken cancellationToken)
    {
        try
        {
            var deleted = await _snapshotStore.PruneAsync(tenantId, KeptVersions, liveVersion, cancellationToken);
            if (deleted > 0)
            {
                _logger.LogInformation("Deleted {Count} old published schema versions for tenant {TenantId}", deleted, tenantId);
            }
        }
        catch (Exception ex)
        {
            // Old versions are retried at the next publish; the publish itself has succeeded.
            _logger.LogWarning(ex, "Could not delete old published schema versions for tenant {TenantId}", tenantId);
        }
    }

    private void EnsureBuilds(string tenantId, SchemaSource source)
    {
        try
        {
            var builder = SchemaBuilder.New();
            // A tenant without definitions has nothing to validate (and nothing to serve).
            if (_schemaBuilder.BuildSchema(tenantId, source, builder))
            {
                builder.Create();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Schema for tenant {TenantId} does not build; nothing was published", tenantId);
            throw new SchemaPublishException($"The schema could not be published because it does not build: {ex.Message}", ex);
        }
    }

    private async Task<List<string>> GetUnadaptedChangeLogIdsAsync(string tenantId)
    {
        var filter = Builders<SchemaChangeLog>.Filter.Eq(log => log.DoesServerAdaptChanges, false);
        var pending = await _repository.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(filter, null, tenantId);
        return pending.Select(log => log.ItemId).ToList();
    }
}
