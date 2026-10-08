using System.Diagnostics;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
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
        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Publish, tenantId);
        var started = Stopwatch.GetTimestamp();
        var step = "reading the pending changes";
        long? version = null;
        var isLive = false;
        try
        {
            // Capture the pending changes first: a change saved while this runs may not be in the
            // drafts read below, so it must stay pending.
            var pendingChangeLogIds = await GetUnadaptedChangeLogIdsAsync(tenantId);
            var (userId, maskedEmail) = SchemaLog.CurrentUser();
            _logger.LogInformation("Publishing the schema for tenant {TenantId}, requested by user {UserId} ({UserEmail}): {ChangeCount} pending changes",
                tenantId, userId, maskedEmail, pendingChangeLogIds.Count);

            step = "reading the drafts";
            var source = await _schemaBuilder.ReadDraftSourceAsync(tenantId);

            // Pack before building: building modifies the definitions, and the snapshot must hold
            // exactly what was read. What is stored is then what was validated.
            step = "test-building the drafts";
            var content = SchemaSnapshotStore.Pack(source);
            var buildStarted = Stopwatch.GetTimestamp();
            EnsureBuilds(tenantId, source);
            var buildMs = SchemaLog.ElapsedMs(buildStarted);

            step = "allocating a version number";
            version = await _versionStore.AllocateAsync(tenantId, cancellationToken);

            step = "storing the snapshot";
            var manifest = await _snapshotStore.SaveAsync(tenantId, version.Value, content, SchemaSnapshotKind.Publish, pendingChangeLogIds, cancellationToken);

            step = "making the version live";
            await _versionStore.MakeCurrentAsync(tenantId, version.Value, cancellationToken);
            isLive = true;

            step = "marking the published changes";
            if (pendingChangeLogIds.Count > 0)
            {
                var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName,
                    new BsonDocument("$in", new BsonArray(pendingChangeLogIds)));
                var update = new BsonDocument(nameof(SchemaChangeLog.DoesServerAdaptChanges), true);
                await _repository.UpdateManyAsync(ChangeLogCollectionName, filter, update, tenantId);
            }

            // Both handle and log their own failures; the publish has succeeded by now.
            await _versionStore.AnnounceAsync(tenantId, version.Value);
            await PruneAsync(tenantId, version.Value, cancellationToken);

            _logger.LogInformation("Published schema version {Version} for tenant {TenantId}: {SchemaCount} schemas, {ChangeCount} changes, {RawKb} KB stored as {CompressedKb} KB in {ChunkCount} chunks; test build {BuildMs} ms, total {ElapsedMs} ms",
                version, tenantId, content.SchemaCount, pendingChangeLogIds.Count, ToKb(content.RawSizeBytes),
                ToKb(content.CompressedBytes.LongLength), manifest.ChunkCount, buildMs, SchemaLog.ElapsedMs(started));
            return new SchemaPublishResult(version.Value, pendingChangeLogIds.Count);
        }
        catch (SchemaPublishException)
        {
            // The drafts do not build: an expected outcome, logged where it is detected.
            throw;
        }
        catch (Exception ex)
        {
            LogPublishFailure(ex, tenantId, step, version, isLive);
            throw;
        }
    }

    public async Task<SchemaRollbackResult> RollbackAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Rollback, tenantId, version);
        var (userId, maskedEmail) = SchemaLog.CurrentUser();

        if (!await _snapshotStore.ExistsAsync(tenantId, version, cancellationToken))
        {
            _logger.LogWarning("Rollback of tenant {TenantId} to schema version {Version}, requested by user {UserId} ({UserEmail}), refused: that version is not kept",
                tenantId, version, userId, maskedEmail);
            throw new SchemaVersionNotFoundException(version);
        }

        var previousVersion = await _versionStore.GetAsync(tenantId, cancellationToken);
        if (previousVersion == version)
        {
            _logger.LogInformation("Rollback of tenant {TenantId} to schema version {Version}, requested by user {UserId} ({UserEmail}): already live, nothing changed",
                tenantId, version, userId, maskedEmail);
            return new SchemaRollbackResult(version, previousVersion);
        }

        await _versionStore.SetCurrentAsync(tenantId, version, cancellationToken);
        await _versionStore.AnnounceAsync(tenantId, version);

        _logger.LogInformation("Rolled back the schema for tenant {TenantId} from version {PreviousVersion} to {Version}, requested by user {UserId} ({UserEmail})",
            tenantId, previousVersion, version, userId, maskedEmail);
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
        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Bootstrap, tenantId);
        var source = await _schemaBuilder.ReadDraftSourceAsync(tenantId);
        var content = SchemaSnapshotStore.Pack(source);

        var version = await _versionStore.AllocateAsync(tenantId, cancellationToken);
        await _snapshotStore.SaveAsync(tenantId, version, content, SchemaSnapshotKind.Bootstrap, [], cancellationToken);

        // Pods that bootstrap at the same moment each store a copy of the same drafts; the highest
        // version wins and the others are never served.
        var currentVersion = await _versionStore.MakeCurrentAsync(tenantId, version, cancellationToken);
        await _versionStore.AnnounceAsync(tenantId, currentVersion);
        await PruneAsync(tenantId, currentVersion, cancellationToken);

        _logger.LogInformation("Created first published schema version {Version} for tenant {TenantId} from its drafts: {SchemaCount} schemas, {CompressedKb} KB; live version is {LiveVersion}",
            version, tenantId, content.SchemaCount, ToKb(content.CompressedBytes.LongLength), currentVersion);
        return (version, source);
    }

    private async Task PruneAsync(string tenantId, long liveVersion, CancellationToken cancellationToken)
    {
        try
        {
            var deleted = await _snapshotStore.PruneAsync(tenantId, KeptVersions, liveVersion, cancellationToken);
            if (deleted > 0)
            {
                _logger.LogInformation("Deleted {Count} old published schema versions for tenant {TenantId}; the newest {Kept} and the live version {Version} are kept",
                    deleted, tenantId, KeptVersions, liveVersion);
            }
        }
        catch (Exception ex)
        {
            // Old versions are retried at the next publish; the publish itself has succeeded.
            _logger.LogWarning(ex, "Could not delete old published schema versions for tenant {TenantId}; retried at the next publish", tenantId);
        }
    }

    private void EnsureBuilds(string tenantId, SchemaSource source)
    {
        var started = Stopwatch.GetTimestamp();
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
            // Not a fault of the service: the admin is shown the reason. Logged so support can see it too.
            _logger.LogWarning(ex, "Schema for tenant {TenantId} does not build ({SchemaCount} schemas, checked in {BuildMs} ms); nothing was published",
                tenantId, source.SchemaDefinitions.Count, SchemaLog.ElapsedMs(started));
            throw new SchemaPublishException($"The schema could not be published because it does not build: {ex.Message}", ex);
        }
    }

    private void LogPublishFailure(Exception ex, string tenantId, string step, long? version, bool isLive)
    {
        if (version is null)
        {
            _logger.LogError(ex, "Publishing the schema for tenant {TenantId} failed while {Step}; nothing was published",
                tenantId, step);
        }
        else if (!isLive)
        {
            _logger.LogError(ex, "Publishing the schema for tenant {TenantId} failed while {Step}; version {Version} was not made live and the live version is unchanged",
                tenantId, step, version);
        }
        else
        {
            _logger.LogError(ex, "Publishing the schema for tenant {TenantId} failed while {Step}; version {Version} is live, but its changes still show as unpublished until the next publish",
                tenantId, step, version);
        }
    }

    private static double ToKb(long bytes) => Math.Round(bytes / 1024d, 1);

    private async Task<List<string>> GetUnadaptedChangeLogIdsAsync(string tenantId)
    {
        var filter = Builders<SchemaChangeLog>.Filter.Eq(log => log.DoesServerAdaptChanges, false);
        var pending = await _repository.GetItemsAsync<SchemaChangeLog, SchemaChangeLog>(filter, null, tenantId);
        return pending.Select(log => log.ItemId).ToList();
    }
}
