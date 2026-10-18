using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using MongoDB.Bson;
using Blocks.Genesis.Entities.Data;
namespace Worker.Consumers;

public class MigrationCompletionEventConsumer : IConsumer<MigrationCompletionEvent>
{
    private readonly ILogger<MigrationCompletionEventConsumer> _logger;
    private readonly IDbRepository _dbRepository;
    public MigrationCompletionEventConsumer(ILogger<MigrationCompletionEventConsumer> logger, IDbRepository dbRepository)
    {
        _logger = logger;
        _dbRepository = dbRepository;
    }
    public async Task Consume(MigrationCompletionEvent @event)
    {
        _logger.LogInformation("Consuming migration completion event for tracker id: {@TrackerId}", @event.TrackerId);
        try
        {
            var migrationTracker = await _dbRepository.GetItemAsync("MigrationTrackers",
        new BsonDocument { { "_id", @event.TrackerId } }, GraphQlConstant.BlocksRootDbName);
            if (migrationTracker == null)
            {
                _logger.LogError("Migration tracker not found for tracker id: {@TrackerId}", @event.TrackerId);
                return;
            }
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
                return;
            }

            _logger.LogInformation("Total impacted data for schema definitions: {@TotalImpactedData}", update.TotalImpactedData);
            _logger.LogInformation("Total impacted data for the root data service configuration: {@TotalImpactedData}", updateRoot.TotalImpactedData);

            _logger.LogInformation("Migration completion event for tracker id: {@TrackerId} consumed successfully", @event.TrackerId);
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Error consuming migration completion event for tracker id: {@TrackerId}", @event.TrackerId);
        }
    }
}
