using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Responses;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Publishes data change events to the message bus for workflow triggers.
/// </summary>
public interface IDataChangeEventPublisher
{
    /// <summary>Publishes a data change event (inserted/updated/deleted).</summary>
    Task PublishAsync(
        SchemaDefinitionExtended schema,
        DataChangeOperation operation,
        List<BsonDocument>? dataDocuments = null,
        List<UpdatedDocument>? updatedDocuments = null);
}

/// <summary>
/// Default implementation that sends events to the configured consumer queue.
/// </summary>
public class DataChangeEventPublisher : IDataChangeEventPublisher
{
    private readonly IMessageClient _messageClient;
    private readonly ILogger<DataChangeEventPublisher> _logger;

    public DataChangeEventPublisher(IMessageClient messageClient, ILogger<DataChangeEventPublisher> logger)
    {
        _messageClient = messageClient;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task PublishAsync(
        SchemaDefinitionExtended schema,
        DataChangeOperation operation,
        List<BsonDocument>? dataDocuments = null,
        List<UpdatedDocument>? updatedDocuments = null)
    {
        try
        {
            var projectKey = TenantContext.GetTenantId();
            if (string.IsNullOrEmpty(projectKey)) return;

            var changeEvent = new DataChangeEvent
            {
                ProjectKey = projectKey,
                CollectionName = schema.CollectionName,
                SchemaName = schema.SchemaName,
                Operation = operation,
                Data = dataDocuments?.Select(BsonConversionHelper.BsonDocumentToDictionary).ToList(),
                UpdatedDocuments = updatedDocuments,
                Timestamp = DateTime.UtcNow
            };

            await _messageClient.SendToConsumerAsync(new ConsumerMessage<DataChangeEvent>
            {
                ConsumerName = GraphQlConstant.DataChangeTriggerQueue,
                Payload = changeEvent
            });

            _logger.LogInformation("Published DataChangeEvent: {Operation} on {SchemaName} ({Count} documents)",
                operation, schema.SchemaName, dataDocuments?.Count ?? updatedDocuments?.Count ?? 0);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish DataChangeEvent for {Operation} on {SchemaName}",
                operation, schema.SchemaName);
        }
    }
}
