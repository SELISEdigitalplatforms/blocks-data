using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using MongoDB.Bson;
using Blocks.Genesis.Entities.Data;
namespace Worker.Consumers;

public class MigrationCompletionEventConsumer : IConsumer<MigrationCompletionEvent>
{
    private readonly ILogger<MigrationCompletionEventConsumer> _logger;
    private readonly IDbRepository _dbRepository;
    private readonly IBuiltInNotificationSender? _notifier;
    public MigrationCompletionEventConsumer(ILogger<MigrationCompletionEventConsumer> logger, IDbRepository dbRepository, IBuiltInNotificationSender? notifier = null)
    {
        _logger = logger;
        _dbRepository = dbRepository;
        _notifier = notifier;
    }

    /// <summary>
    /// Tells the user who started the migration that it failed (tracker CreatedBy), in the source project's
    /// tenant. Best effort: the sender never throws. Sent at most once per event.
    /// </summary>
    private async Task NotifyFailedAsync(BsonDocument? tracker, string trackerId, string reason)
    {
        if (_notifier is null || tracker is null) return;
        var sourceTenant = tracker.TryGetValue("ProjectKey", out var pk) && pk.IsString ? pk.AsString : string.Empty;
        var userId = tracker.TryGetValue("CreatedBy", out var cb) && cb.IsString ? cb.AsString : string.Empty;
        if (userId == "system") userId = string.Empty;
        await _notifier.SendAsync(new BuiltInNotification(
            sourceTenant,
            "data-project-migration-failed",
            BuiltInNotificationSender.Recipients(userId),
            new
            {
                @event = "data-project-migration-failed",
                title = "Project migration failed",
                description = "Moving schemas and data configs to the other project failed.",
                isSuccess = false,
                trackerId,
                reason,
                occurredAt = DateTime.UtcNow
            }));
    }
    public async Task Consume(MigrationCompletionEvent @event)
    {
        _logger.LogInformation("Consuming migration completion event for tracker id: {@TrackerId}", @event.TrackerId);
        BsonDocument? migrationTracker = null;
        try
        {
            migrationTracker = await _dbRepository.GetItemAsync("MigrationTrackers",
        new BsonDocument { { "_id", @event.TrackerId } }, GraphQlConstant.BlocksRootDbName);
            if (migrationTracker == null)
            {
                _logger.LogError("Migration tracker not found for tracker id: {@TrackerId}", @event.TrackerId);
                return;
            }
            if (!@event.IsSuccess)
                await NotifyFailedAsync(migrationTracker, @event.TrackerId, "migration-reported-failure");
            var projectKey = migrationTracker.GetValue("ProjectKey").AsString;
            var targetedProjectKey = migrationTracker.GetValue("TargetedProjectKey").AsString;
            // Project short keys (slugs) are no longer used; clear the source project's so it is not carried over.
            var targetedProjectShortKey = string.Empty;
            var update = await _dbRepository.UpdateManyAsync(
                $"{nameof(SchemaDefinition)}s",
                new BsonDocument { { nameof(SchemaDefinition.ProjectKey), projectKey } },
                new BsonDocument {
                { nameof(SchemaDefinition.ProjectKey), targetedProjectKey },
                { nameof(SchemaDefinition.ProjectShortKey), targetedProjectShortKey }
                    },
                targetedProjectKey
            );
            if (!update.Acknowledged)
            {
                _logger.LogWarning("Failed to update schema definitions for tracker id: {@TrackerId}", @event.TrackerId);
                if (@event.IsSuccess)
                    await NotifyFailedAsync(migrationTracker, @event.TrackerId, "schemas-not-updated");
                return;
            }
            // The root doc (BlocksRootDb, _id = TenantId) is the only data-source config; no tenant DB doc exists. Field $set, retry-safe.
            var updateRoot = await _dbRepository.UpdateManyAsync(
                $"{nameof(DataServiceConfiguration)}s",
                new BsonDocument {
                { "_id", targetedProjectKey },
                { nameof(DataServiceConfiguration.ProjectKey), projectKey }
                    },
                new BsonDocument {
                { nameof(DataServiceConfiguration.ProjectKey), targetedProjectKey },
                { nameof(DataServiceConfiguration.ProjectShortKey), targetedProjectShortKey }
                    },
                GraphQlConstant.BlocksRootDbName
            );
            if (!updateRoot.Acknowledged)
            {
                _logger.LogWarning("Failed to update the root data service configuration for tracker id: {@TrackerId}", @event.TrackerId);
                if (@event.IsSuccess)
                    await NotifyFailedAsync(migrationTracker, @event.TrackerId, "configuration-not-updated");
                return;
            }

            _logger.LogInformation("Total impacted data for schema definitions: {@TotalImpactedData}", update.TotalImpactedData);
            _logger.LogInformation("Total impacted data for the root data service configuration: {@TotalImpactedData}", updateRoot.TotalImpactedData);

            _logger.LogInformation("Migration completion event for tracker id: {@TrackerId} consumed successfully", @event.TrackerId);
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Error consuming migration completion event for tracker id: {@TrackerId}", @event.TrackerId);
            if (@event.IsSuccess)
                await NotifyFailedAsync(migrationTracker, @event.TrackerId, "error");
        }
    }
}
