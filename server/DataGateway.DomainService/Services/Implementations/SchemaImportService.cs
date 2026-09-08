using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models.Export;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using System.Text.Json;

namespace DataGateway.DomainService.Services;

public class SchemaImportService : ISchemaImportService
{
    private readonly IMessageClient _messageClient;
    private readonly IDbRepository _dbRepository;
    private readonly ILogger<SchemaImportService> _logger;
    private readonly SchemaImportValidator _schemaImportValidator;

    public SchemaImportService(
        IMessageClient messageClient,
        IDbRepository dbRepository,
        ILogger<SchemaImportService> logger,
        SchemaImportValidator schemaImportValidator)
    {
        _messageClient = messageClient;
        _dbRepository = dbRepository;
        _logger = logger;
        _schemaImportValidator = schemaImportValidator;
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> InitiateImportAsync(ImportSchemaRequest request)
    {
        var context = BlocksContext.GetContext();
        var tenantId = context?.TenantId ?? string.Empty;

        await _messageClient.SendToConsumerAsync(new ConsumerMessage<SchemaImportEvent>
        {
            ConsumerName = GraphQlConstant.DataGatewayQueueName,
            Payload = new SchemaImportEvent
            {
                FileId = request.FileId,
                ProjectKey = tenantId,
                MessageCoRelationId = request.MessageCoRelationId,
                CallerUserId = context?.UserId ?? string.Empty,
                CallerTenantId = context?.OriginalTenantId ?? string.Empty
            }
        });

        _logger.LogInformation("Schema import initiated: fileId={FileId}, projectKey={ProjectKey}", request.FileId, tenantId);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = request.FileId });
    }

    /// <inheritdoc />
    public async Task<int> ProcessImportAsync(SchemaImportEvent importEvent, byte[] jsonBytes)
    {
        // 1. Deserialize
        List<SchemaExportDocument> documents;
        try
        {
            documents = JsonSerializer.Deserialize<List<SchemaExportDocument>>(jsonBytes, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? [];
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to deserialize import file for fileId={importEvent.FileId}: {ex.Message}", ex);
        }

        if (documents.Count == 0)
        {
            _logger.LogWarning("ProcessImportAsync: No documents found in import file for fileId={FileId}", importEvent.FileId);
            return 0;
        }

        // 2. Validate documents
        var validationErrors = await _schemaImportValidator.ValidateAsync(documents);
        if (validationErrors.Count > 0)
            throw new InvalidOperationException($"Import validation failed:\n{string.Join("\n", validationErrors)}");

        // 3. Determine what's present in the file
        bool hasAccessPolicies = documents.Any(d =>
            (d.RowLevelPolicies != null && d.RowLevelPolicies.Count > 0) ||
            d.Fields.Any(f => f.AccessPolicies != null));

        bool hasValidationRules = documents.Any(d =>
            d.Fields.Any(f => f.ValidationRules != null));

        // 4. Bulk upsert all schemas, policies, validations, and change logs
        var importedSchemas = await BulkUpsertSchemasAsync(documents);
        var changeLogs = new List<SchemaChangeLog>();

        if (hasAccessPolicies)
            await BulkUpsertAccessPoliciesAsync(importedSchemas, changeLogs);

        if (hasValidationRules)
            await BulkUpsertValidationsAsync(importedSchemas, changeLogs);

        // Schema-level change logs
        foreach (var (_, schema, changeType) in importedSchemas)
            BuildChangeLog(schema.ItemId, changeType, changeLogs);

        await BulkInsertChangeLogsAsync(changeLogs);

        _logger.LogInformation("ProcessImportAsync: Imported {Count} schemas for fileId={FileId}", importedSchemas.Count, importEvent.FileId);
        return importedSchemas.Count;
    }

    /// <summary>
    /// Fetches all existing schemas in one query, applies in-memory updates, then bulk-upserts everything.
    /// Returns a list of (document, resolved schema entity, change type) for downstream use.
    /// </summary>
    private async Task<List<(SchemaExportDocument Doc, SchemaDefinition Schema, SchemaChangeType ChangeType)>> BulkUpsertSchemasAsync(
        List<SchemaExportDocument> documents)
    {
        var schemaNames = documents.Select(d => d.SchemaName).ToList();
        var existingSchemas = await _dbRepository.GetItemsAsync<SchemaDefinition, SchemaDefinition>(
            Builders<SchemaDefinition>.Filter.In(s => s.SchemaName, schemaNames));
        var existingBySchemaName = existingSchemas.ToDictionary(s => s.SchemaName, StringComparer.OrdinalIgnoreCase);

        var toUpsert = new List<SchemaDefinition>();
        var result = new List<(SchemaExportDocument, SchemaDefinition, SchemaChangeType)>();

        foreach (var doc in documents)
        {
            SchemaDefinition schema;
            SchemaChangeType changeType;

            if (existingBySchemaName.TryGetValue(doc.SchemaName, out var existing))
            {
                var mapped = doc.MapToSchemaDefinition();
                existing.SchemaName = mapped.SchemaName;
                existing.SchemaType = mapped.SchemaType;
                existing.ReadAccessLevel = mapped.ReadAccessLevel;
                existing.WriteAccessLevel = mapped.WriteAccessLevel;
                existing.EditAccessLevel = mapped.EditAccessLevel;
                existing.DeleteAccessLevel = mapped.DeleteAccessLevel;
                existing.Fields = mapped.Fields;
                if (existing.SchemaType == SchemaType.Entity)
                    existing.AddDefaultFields();
                schema = existing;
                changeType = SchemaChangeType.SchemaUpdate;
            }
            else
            {
                schema = doc.MapToSchemaDefinition();
                if (schema.SchemaType == SchemaType.Entity)
                    schema.AddDefaultFields();
                schema.InjectDefaultValue();
                changeType = SchemaChangeType.SchemaCreate;
            }

            toUpsert.Add(schema);
            result.Add((doc, schema, changeType));
        }

        await _dbRepository.UpsertManyAsync(toUpsert);
        return result;
    }

    /// <summary>
    /// Deletes all existing policies for the affected schemas in one query,
    /// then bulk-inserts all new policies.
    /// </summary>
    private async Task BulkUpsertAccessPoliciesAsync(
        List<(SchemaExportDocument Doc, SchemaDefinition Schema, SchemaChangeType)> importedSchemas,
        List<SchemaChangeLog> changeLogs)
    {
        var schemaNames = importedSchemas.Select(x => x.Schema.SchemaName).ToList();
        await _dbRepository.DeleteManyAsync(
            Builders<DataAccessPolicy>.Filter.In(p => p.SchemaName, schemaNames));

        var toInsert = new List<DataAccessPolicy>();

        foreach (var (doc, schema, _) in importedSchemas)
        {
            foreach (var rls in doc.RowLevelPolicies ?? [])
            {
                var policy = rls.MapToRlsPolicy(schema.ItemId, schema.SchemaName);
                policy.InjectDefaultValue();
                toInsert.Add(policy);
                BuildChangeLog(schema.ItemId, SchemaChangeType.SchemaPolicyCreate, changeLogs);
            }

            foreach (var policy in doc.MapToClsPolicies(schema.ItemId, schema.SchemaName))
            {
                policy.InjectDefaultValue();
                toInsert.Add(policy);
                BuildChangeLog(schema.ItemId, SchemaChangeType.SchemaPolicyCreate, changeLogs);
            }
        }

        if (toInsert.Count > 0)
            await _dbRepository.InsertManyAsync(toInsert);
    }

    /// <summary>
    /// Fetches all existing validations for the affected schemas in one query,
    /// then bulk-updates existing and bulk-inserts new ones.
    /// </summary>
    private async Task BulkUpsertValidationsAsync(
        List<(SchemaExportDocument Doc, SchemaDefinition Schema, SchemaChangeType)> importedSchemas,
        List<SchemaChangeLog> changeLogs)
    {
        var schemaIds = importedSchemas.Select(x => x.Schema.ItemId).ToList();
        var existingValidations = await _dbRepository.GetItemsAsync<DataValidation, DataValidation>(
            Builders<DataValidation>.Filter.In(v => v.SchemaId, schemaIds));
        var existingByKey = existingValidations.ToDictionary(v => (v.SchemaId, v.FieldName));

        var toUpdate = new List<DataValidation>();
        var toInsert = new List<DataValidation>();

        foreach (var (doc, schema, _) in importedSchemas)
        {
            foreach (var field in doc.Fields.Where(f => f.ValidationRules != null))
            {
                var rules = field.ValidationRules!.Select(r => r.MapToValidationRule()).ToList();
                var key = (schema.ItemId, field.Name);

                if (existingByKey.TryGetValue(key, out var existing))
                {
                    existing.Validations = rules;
                    toUpdate.Add(existing);
                    BuildChangeLog(schema.ItemId, SchemaChangeType.SchemaFieldValidationUpdate, changeLogs);
                }
                else
                {
                    var validation = new DataValidation { SchemaId = schema.ItemId, FieldName = field.Name, Validations = rules };
                    validation.InjectDefaultValue();
                    toInsert.Add(validation);
                    BuildChangeLog(schema.ItemId, SchemaChangeType.SchemaFieldValidationCreate, changeLogs);
                }
            }
        }

        if (toUpdate.Count > 0)
            await _dbRepository.UpdateManyAsync(toUpdate);

        if (toInsert.Count > 0)
            await _dbRepository.InsertManyAsync(toInsert);
    }

    private async Task BulkInsertChangeLogsAsync(List<SchemaChangeLog> changeLogs)
    {
        if (changeLogs.Count == 0) return;
        try
        {
            await _dbRepository.InsertManyAsync(changeLogs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to insert {Count} schema change logs", changeLogs.Count);
        }
    }

    private static void BuildChangeLog(string schemaId, SchemaChangeType changeType, List<SchemaChangeLog> changeLogs)
    {
        var log = new SchemaChangeLog { SchemaId = schemaId, ChangeType = changeType, DoesServerAdaptChanges = false };
        log.InjectDefaultValue();
        changeLogs.Add(log);
    }
}
