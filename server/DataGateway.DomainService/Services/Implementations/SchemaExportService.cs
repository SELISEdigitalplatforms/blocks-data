using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace DataGateway.DomainService.Services;

public class SchemaExportService : ISchemaExportService
{
    private readonly IMessageClient _messageClient;
    private readonly IDbRepository _dbRepository;
    private readonly ILogger<SchemaExportService> _logger;

    public SchemaExportService(
        IMessageClient messageClient,
        IDbRepository dbRepository,
        ILogger<SchemaExportService> logger)
    {
        _messageClient = messageClient;
        _dbRepository = dbRepository;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> InitiateExportAsync(ExportSchemaRequest request)
    {
        var fileId = Guid.NewGuid().ToString();
        var context = BlocksContext.GetContext();
        var tenantId = context?.TenantId ?? string.Empty;

        await _messageClient.SendToConsumerAsync(new ConsumerMessage<SchemaExportEvent>
        {
            ConsumerName = GraphQlConstant.DataGatewayQueueName,
            Payload = new SchemaExportEvent
            {
                FileId = fileId,
                ProjectKey = tenantId,
                MessageCoRelationId = request.MessageCoRelationId,
                ExportOption = request.ExportOption,
                CallerUserId = context?.UserId ?? string.Empty,
                CallerTenantId = context?.OriginalTenantId ?? string.Empty
            }
        });

        _logger.LogInformation("Schema export initiated: fileId={FileId}, projectKey={ProjectKey}", fileId, tenantId);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = fileId });
    }

    /// <inheritdoc />
    public async Task<(byte[] JsonBytes, string FileName)> BuildExportBytesAsync(SchemaExportEvent exportEvent)
    {
        var fileName = $"schema_export_{DateTime.UtcNow:yyyyMMddHHmmss}.json";

        // 1. Fetch all schemas — ProjectKey is a routing key (selects the DB), not a stored document field
        var schemas = await _dbRepository.GetItemsAsync<SchemaDefinition>(new BsonDocument(), null, null, 0, 1000);

        // 2. Fetch policies only when AccessPolicies flag is set (covers both RLS rules and CLS)
        //    For Schema-only export, access levels are already on SchemaDefinition itself
        var allPolicies = new List<DataAccessPolicy>();
        if (exportEvent.ExportOption.HasFlag(SchemaExportOption.AccessPolicies) && schemas.Count > 0)
        {
            var schemaNames = schemas.Select(s => s.SchemaName).Distinct().ToList();
            var policyFilter = new BsonDocument(nameof(DataAccessPolicy.SchemaName),
                new BsonDocument("$in", new BsonArray(schemaNames)));
            allPolicies = await _dbRepository.GetItemsAsync<DataAccessPolicy>(policyFilter, null, null, 0, 5000);
        }

        // 3. Fetch validations only when the flag is set
        var allValidations = new List<DataValidation>();
        if (exportEvent.ExportOption.HasFlag(SchemaExportOption.ValidationRules) && schemas.Count > 0)
        {
            var schemaIds = schemas.Select(s => s.ItemId).Distinct().ToList();
            var validationFilter = new BsonDocument(nameof(DataValidation.SchemaId),
                new BsonDocument("$in", new BsonArray(schemaIds)));
            allValidations = await _dbRepository.GetItemsAsync<DataValidation>(validationFilter, null, null, 0, 5000);
        }

        // 4. Build export documents
        var exportDocuments = schemas.MapToExportDocuments(allPolicies, allValidations, exportEvent.ExportOption);

        // 5. Serialize to JSON bytes
        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(exportDocuments, new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        _logger.LogInformation("BuildExportBytesAsync: Built {Count} export documents for fileId={FileId}", exportDocuments.Count, exportEvent.FileId);
        return (jsonBytes, fileName);
    }

    /// <inheritdoc />
    public async Task InsertExportRecordAsync(SchemaExportEvent exportEvent, string fileName)
    {
        var record = new SchemaExportRecord
        {
            FileId = exportEvent.FileId,
            FileName = fileName,
            ExportOption = exportEvent.ExportOption,
            ExportedAt = DateTime.UtcNow
        };
        record.InjectDefaultValue();
        await _dbRepository.InsertAsync(record);
        _logger.LogInformation("InsertExportRecordAsync: Record created for fileId={FileId}", exportEvent.FileId);
    }

}
