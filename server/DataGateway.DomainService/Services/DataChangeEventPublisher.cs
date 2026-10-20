using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Models.Responses;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using System.Text;
using System.Text.Json;

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

    /// <summary>
    /// Publishes the documents of ONE operation (bulk delete only) in byte-capped messages
    /// (data SPEC1 §3.3b step 3): a message is filled in read order while
    /// <c>envelope reserve (8 KB) + sum(doc wire sizes) ≤ 192 KB</c>, then sent with
    /// <see cref="PublishAsync"/>; one doc bigger than the cap goes alone (warning
    /// <c>oversized-data-event</c>). Messages go out one after another, in order.
    /// </summary>
    Task PublishInChunksAsync(
        SchemaDefinitionExtended schema,
        DataChangeOperation operation,
        IReadOnlyList<BsonDocument> documents);
}

/// <summary>
/// Default implementation that sends events to the configured consumer queue.
/// </summary>
public class DataChangeEventPublisher : IDataChangeEventPublisher
{
    /// <summary>Max wire size of one chunked message (192 KB; headroom to 256 KB = headers).</summary>
    public const int MessageCapBytes = 196_608;

    /// <summary>Bytes kept for the event envelope (ProjectKey, names, operation, timestamp, JSON array).</summary>
    public const int EnvelopeReserveBytes = 8 * 1024;

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
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Publish);

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

    /// <inheritdoc />
    public async Task PublishInChunksAsync(
        SchemaDefinitionExtended schema,
        DataChangeOperation operation,
        IReadOnlyList<BsonDocument> documents)
    {
        if (documents is null || documents.Count == 0)
            return;

        var chunk = new List<BsonDocument>();
        long chunkBytes = EnvelopeReserveBytes;

        foreach (var document in documents)
        {
            int size;
            try
            {
                size = MeasureWireSize(document);
            }
            catch (Exception ex)
            {
                // A doc that cannot be measured goes alone; PublishAsync then catches and logs its own error (as today).
                _logger.LogWarning("Could not measure a {Operation} event document on {SchemaName} ({ErrorType}); it is sent alone",
                    operation, schema.SchemaName, ex.GetType().Name);
                size = int.MaxValue - EnvelopeReserveBytes;
            }

            if (EnvelopeReserveBytes + size > MessageCapBytes)
            {
                if (chunk.Count > 0)
                {
                    await PublishAsync(schema, operation, dataDocuments: chunk);
                    chunk = new List<BsonDocument>();
                    chunkBytes = EnvelopeReserveBytes;
                }

                _logger.LogWarning("oversized-data-event: {Operation} on {SchemaName}, one document of {Size} bytes on the wire is sent alone",
                    operation, schema.SchemaName, size);
                await PublishAsync(schema, operation, dataDocuments: new List<BsonDocument> { document });
                continue;
            }

            if (chunk.Count > 0 && chunkBytes + size > MessageCapBytes)
            {
                await PublishAsync(schema, operation, dataDocuments: chunk);
                chunk = new List<BsonDocument>();
                chunkBytes = EnvelopeReserveBytes;
            }

            chunk.Add(document);
            chunkBytes += size;
        }

        if (chunk.Count > 0)
            await PublishAsync(schema, operation, dataDocuments: chunk);
    }

    /// <summary>
    /// Wire size of one document: UTF-8 bytes of the JSON of the JSON (Genesis serializes the payload,
    /// then the envelope holding that text, so every quote costs 2 bytes).
    /// </summary>
    public static int MeasureWireSize(BsonDocument document)
    {
        var json = JsonSerializer.Serialize(BsonConversionHelper.BsonDocumentToDictionary(document));
        return Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(json));
    }
}
