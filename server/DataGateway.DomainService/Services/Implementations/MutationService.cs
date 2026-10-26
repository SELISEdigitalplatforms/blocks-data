using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Collections;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;
using Blocks.Genesis.DataAccess.Rules;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Service for executing GraphQL mutations (insert, update, delete) with RLS/CLS and event publishing.
/// </summary>
public class MutationService : IMutationService
{
    private const string OperationLabelCreate = "CREATE";
    private const string OperationLabelUpdate = "UPDATE";
    private const string ColumnAccessValidationType = "ColumnAccess";
    private const string OperationLabelDelete = "DELETE";
    private readonly IGqlDbRepository _repository;
    private readonly IDataChangeEventPublisher _eventPublisher;
    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger<MutationService> _logger;
    private readonly IBuiltInNotificationSender? _notifier;
    private readonly IAfterWriteQueue? _afterWrite;

    public MutationService(
        IGqlDbRepository repository,
        IDataChangeEventPublisher eventPublisher,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger<MutationService> logger,
        IBuiltInNotificationSender? notifier = null,
        IAfterWriteQueue? afterWrite = null)
    {
        _repository = repository;
        _eventPublisher = eventPublisher;
        _resolver = resolver;
        _principals = principals;
        _logger = logger;
        _notifier = notifier;
        _afterWrite = afterWrite;
    }

    /// <summary>
    /// After a write: the change event and the bulk notification go to the background queue (with a copy
    /// of the context), so the response does not wait for them. Without a queue they run inline.
    /// </summary>
    private Task AfterWriteAsync(Func<Task> work)
    {
        if (_afterWrite is null) return work();
        return _afterWrite.EnqueueAsync(work);
    }

    /// <summary>
    /// One final result per bulk request, to the caller (never per row or per batch). Best effort: the
    /// sender never throws. Not saved to the inbox (the config has persistence off).
    /// </summary>
    private async Task NotifyBulkResultAsync(SchemaDefinitionExtended schema, string operation, bool acknowledged, long count)
    {
        if (_notifier is null) return;
        var context = BlocksContext.GetContext();
        await _notifier.SendAsync(new BuiltInNotification(
            context?.TenantId ?? string.Empty,
            "data-bulk-change-progress",
            BuiltInNotificationSender.Recipients(context?.UserId),
            new
            {
                @event = "data-bulk-change-progress",
                title = "Bulk change finished",
                description = acknowledged ? $"Bulk {operation} finished." : $"Bulk {operation} was not completed.",
                isSuccess = acknowledged,
                schemaName = schema.SchemaName,
                operation,
                affectedCount = count,
                occurredAt = DateTime.UtcNow
            }));
    }

    /// <inheritdoc />
    public async Task<ActionResponse> InsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Inserting data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.WRITE, OperationLabelCreate);
        var input = MutationInputHelper.ParseMutationInput(context, inputType);
        var sentPaths = MutationInputHelper.GetAllPathsFromInput(input, string.Empty);
        RecordOrganizationRule.EnsureForInsert([input], _principals.Current);
        var now = DateTime.UtcNow;
        var defaults = ApplyFieldDefaults(input, schema, now);
        ValidateMutationInputOrThrow(input, schema, OperationLabelCreate, now);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelCreate);
        await ValidateUniquenessOrThrowAsync(schema, [input], null, OperationLabelCreate);
        ThrowIfColumnRulesRefuse(schema, [(null, RefusedOnInsert(schema, sentPaths, input))], OperationLabelCreate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
        FieldDefaultsApplier.Apply(input, defaults);
        input.InjectDefaultValueOnInsert();
        MutationInputHelper.EnsureDefaultListsForInsert(input);
        MutationInputHelper.AddRequesterToAccessLists(input, schema);

        var document = InputToBsonDocument(input);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "insert", document } }.ToString();
        try
        {
            await _repository.InsertAsync(schema.CollectionName, document);
        }
        catch (Exception ex) when (TryGetDuplicateKeyFieldNames(ex, out var duplicateFields))
        {
            ThrowUniqueConstraintViolation(schema.SchemaName, OperationLabelCreate, duplicateFields);
        }
        var itemId = document[GraphQlConstant.DbEntityIdFieldName].ToString();

        await AfterWriteAsync(() => _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted,
            dataDocuments: new List<BsonDocument> { document }));

        gatewayOperation.ResponseSize = document.ToBson().Length;
        gatewayOperation.DocumentCount = 1;

        _logger.LogInformation("Data inserted for schema {SchemaName}", schema.SchemaName);

        return new ActionResponse { Acknowledged = true, ItemId = itemId };
    }

    /// <inheritdoc />
    public async Task<ActionResponse> UpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Updating data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.EDIT, OperationLabelUpdate);
        var filter = MutationFilterHelper.BuildFilterWithRls(context, schema, PolicyOperation.EDIT, EvaluateRlsPolicies);
        var existingDocument = await _repository.GetItemAsync(schema.CollectionName, filter);
        if (existingDocument is null)
            return MutationInputHelper.ActionResponseNotFound(OperationLabelUpdate);

        var input = MutationInputHelper.ParseMutationInput(context, inputType);
        ValidateMutationInputOrThrow(input, schema, OperationLabelUpdate, DateTime.UtcNow, existingDocument);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelUpdate);
        var currentId = existingDocument[GraphQlConstant.DbEntityIdFieldName]?.ToString();
        await ValidateUniquenessOrThrowAsync(schema, [input], currentId is not null ? [currentId] : null, OperationLabelUpdate);
        ThrowIfColumnRulesRefuse(schema, [(null, RefusedOnEdit(schema, input, existingDocument))], OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
        RecordOrganizationRule.EnsureForUpdate(input, _principals.Current);
        input.InjectDefaultValueOnUpdate();

        var document = InputToBsonDocument(input);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter }, { "update", document } }.ToString();
        ActionResponse response;
        try
        {
            response = await _repository.UpdateAsync(schema.CollectionName, filter, document);
        }
        catch (Exception ex) when (TryGetDuplicateKeyFieldNames(ex, out var duplicateFields))
        {
            ThrowUniqueConstraintViolation(schema.SchemaName, OperationLabelUpdate, duplicateFields);
            throw;
        }
        response.ItemId = existingDocument[GraphQlConstant.DbEntityIdFieldName]?.ToString();
        await PublishUpdateEventAsync(schema, existingDocument, document, response.ItemId ?? string.Empty, response.Acknowledged);

        gatewayOperation.ResponseSize = document.ToBson().Length;
        gatewayOperation.DocumentCount = 1;

        _logger.LogInformation("Data updated for schema {SchemaName}", schema.SchemaName);

        return response;
    }

    /// <inheritdoc />
    public async Task<ActionResponse> DeleteAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Deleting data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.DELETE, OperationLabelDelete);
        var filter = MutationFilterHelper.BuildFilterWithRls(context, schema, PolicyOperation.DELETE, EvaluateRlsPolicies);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter } }.ToString();
        var sort = new BsonDocument();
        var matchingDocuments = await _repository.GetItemsAsync(schema.CollectionName, filter, sort);
        if (matchingDocuments is null || matchingDocuments.Count == 0)
            return MutationInputHelper.ActionResponseNotFound(OperationLabelDelete);

        var firstDocument = matchingDocuments.FirstOrDefault();
        var itemId = firstDocument?[GraphQlConstant.DbEntityIdFieldName]?.ToString() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(itemId))
            return MutationInputHelper.ActionResponseNotFound(OperationLabelDelete);

        var deleteFilter = new BsonDocument { { GraphQlConstant.DbEntityIdFieldName, itemId } };

        if (!MutationInputHelper.IsHardDeleteRequested(context, inputType))
        {
            await SaveDeletedRecordAsync(schema, new List<BsonDocument> { firstDocument! });
        }
        var response = await _repository.DeleteAsync(schema.CollectionName, deleteFilter);

        response.ItemId = itemId;
        if (response.Acknowledged)
            await AfterWriteAsync(() => _eventPublisher.PublishAsync(schema, DataChangeOperation.Deleted,
                dataDocuments: new List<BsonDocument> { firstDocument! }));

        gatewayOperation.ResponseSize = firstDocument!.ToBson().Length;
        gatewayOperation.DocumentCount = 1;

        _logger.LogInformation("Data deleted for schema {SchemaName}", schema.SchemaName);

        return response;
    }

    /// <summary>Max docs read and deleted per bulk-delete batch (data SPEC1 §3.3b).</summary>
    public const int BulkDeleteMaxDocs = 500;

    /// <summary>Max BSON bytes read per bulk-delete batch (16 MB).</summary>
    public const long BulkDeleteMaxBatchBytes = 16L * 1024 * 1024;

    /// <inheritdoc />
    public async Task<ActionResponse> BulkDeleteAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Bulk deleting data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.DELETE, OperationLabelDelete);
        var filter = MutationFilterHelper.BuildFilterWithRls(context, schema, PolicyOperation.DELETE, EvaluateRlsPolicies);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter } }.ToString();
        var isHardDelete = MutationInputHelper.IsHardDeleteRequested(context, inputType);

        // Batches of <= 500 docs and <= 16 MB, re-read from the start after each delete (no keyset:
        // works for any _id type). No DB pin and no cancel check (as today's single DeleteMany).
        var sort = new BsonDocument(GraphQlConstant.DbEntityIdFieldName, 1);
        var maxDocs = BulkDeleteMaxDocs;
        var acknowledged = true;
        long totalDeleted = 0;
        var totalDocuments = 0;
        long totalBytes = 0;
        var batchNumber = 0;

        while (true)
        {
            var batch = await _repository.GetItemsBatchAsync(schema.CollectionName, filter, sort, maxDocs, BulkDeleteMaxBatchBytes);
            if (batch.Documents.Count == 0)
            {
                if (batchNumber == 0)
                    return MutationInputHelper.ActionResponseNotFound(OperationLabelDelete);
                break;
            }
            batchNumber++;

            if (!isHardDelete)
                await SaveDeletedRecordAsync(schema, batch.Documents);

            // Raw BsonValue ids (never strings) and $and: the user's filter may already hold _id.
            var ids = new BsonArray(batch.Documents.Select(d => d[GraphQlConstant.DbEntityIdFieldName]));
            var deleteFilter = BuildBatchDeleteFilter(filter, ids);
            var batchResponse = await _repository.DeleteManyAsync(schema.CollectionName, deleteFilter);

            if (batchResponse.Acknowledged)
                await AfterWriteAsync(() => _eventPublisher.PublishInChunksAsync(schema, DataChangeOperation.Deleted, batch.Documents));

            acknowledged &= batchResponse.Acknowledged;
            totalDeleted += batchResponse.TotalImpactedData;
            totalDocuments += batch.Documents.Count;
            totalBytes += batch.TotalBytes;

            if (batchResponse.TotalImpactedData == 0)
            {
                _logger.LogWarning("Bulk delete on schema {SchemaName}: batch {Batch} deleted 0 of {Read} read documents; stopping",
                    schema.SchemaName, batchNumber, batch.Documents.Count);
                break;
            }

            maxDocs = NextBulkDeleteBatchSize(batch.TotalBytes, batch.Documents.Count);
        }

        gatewayOperation.ResponseSize = (int)Math.Min(totalBytes, int.MaxValue);
        gatewayOperation.DocumentCount = totalDocuments;

        _logger.LogInformation("Data bulk deleted for schema {SchemaName} ({Count} documents in {Batches} batches)",
            schema.SchemaName, totalDeleted, batchNumber);

        await AfterWriteAsync(() => NotifyBulkResultAsync(schema, "delete", acknowledged, totalDeleted));
        return new ActionResponse { Acknowledged = acknowledged, TotalImpactedData = totalDeleted };
    }

    /// <summary><c>{$and: [F, {_id: {$in: ids}}]}</c> — F again, so a doc that stopped matching is kept.</summary>
    internal static BsonDocument BuildBatchDeleteFilter(BsonDocument filter, BsonArray ids) =>
        new("$and", new BsonArray
        {
            filter,
            new BsonDocument(GraphQlConstant.DbEntityIdFieldName, new BsonDocument("$in", ids))
        });

    /// <summary><c>clamp(floor(16 MB / average BSON size of the last batch), 1, 500)</c>.</summary>
    internal static int NextBulkDeleteBatchSize(long batchBytes, int batchCount)
    {
        if (batchCount <= 0 || batchBytes <= 0)
            return BulkDeleteMaxDocs;
        var average = (double)batchBytes / batchCount;
        var next = (long)Math.Floor(BulkDeleteMaxBatchBytes / average);
        return (int)Math.Clamp(next, 1, BulkDeleteMaxDocs);
    }

    /// <inheritdoc />
    public async Task<BulkActionResponse> BulkInsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Bulk inserting data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.WRITE, OperationLabelCreate);
        var listNode = context.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName) as ListValueNode;
        var inputs = GraphQlTypeHelper.MapBulkMutationInput(listNode, inputType);
        if (inputs == null || inputs.Count == 0)
            return new BulkActionResponse { Acknowledged = true, TotalImpactedData = 0 };
        var sentPathsPerInput = inputs.Select(input => MutationInputHelper.GetAllPathsFromInput(input, string.Empty)).ToList();
        // Every row is checked before any row is written.
        RecordOrganizationRule.EnsureForInsert(inputs, _principals.Current);

        // One "now" for the whole batch, so every row's Now default is the same.
        var now = DateTime.UtcNow;
        var defaultsPerInput = inputs.Select(input => ApplyFieldDefaults(input, schema, now)).ToList();
        foreach (var input in inputs)
            ValidateMutationInputOrThrow(input, schema, OperationLabelCreate, now);

        await ValidateReferencesOrThrowAsync(schema, inputs, references, OperationLabelCreate);
        await ValidateUniquenessOrThrowAsync(schema, inputs, null, OperationLabelCreate);
        ThrowIfColumnRulesRefuse(
            schema,
            inputs.Select((input, i) => ((string?)$"Item {i}", RefusedOnInsert(schema, sentPathsPerInput[i], input))).ToList(),
            OperationLabelCreate);

        var documents = new List<BsonDocument>();
        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
            FieldDefaultsApplier.Apply(input, defaultsPerInput[i]);
            input.InjectDefaultValueOnInsert();
            MutationInputHelper.EnsureDefaultListsForInsert(input);
            MutationInputHelper.AddRequesterToAccessLists(input, schema);
            documents.Add(InputToBsonDocument(input));
        }

        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "insertMany", new BsonArray(documents) } }.ToString();
        BulkActionResponse response;
        try
        {
            response = await _repository.InsertManyAsync(schema.CollectionName, documents);
        }
        catch (Exception ex) when (TryGetDuplicateKeyFieldNames(ex, out var duplicateFields))
        {
            ThrowUniqueConstraintViolation(schema.SchemaName, OperationLabelCreate, duplicateFields);
            throw;
        }

        gatewayOperation.ResponseSize = documents.Sum(d => d.ToBson().Length);
        gatewayOperation.DocumentCount = documents.Count;

        _logger.LogInformation("Data bulk inserted for schema {SchemaName}", schema.SchemaName);

        var publishInsert = response.Acknowledged && documents.Count > 0;
        await AfterWriteAsync(() => Task.WhenAll(
            publishInsert ? _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted, dataDocuments: documents) : Task.CompletedTask,
            NotifyBulkResultAsync(schema, "insert", response.Acknowledged, response.TotalImpactedData)));
        return response;
    }

    /// <inheritdoc />
    public async Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Bulk updating data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.EDIT, OperationLabelUpdate);
        var filter = MutationFilterHelper.BuildFilterWithRls(context, schema, PolicyOperation.EDIT, EvaluateRlsPolicies);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter } }.ToString();
        var existingDocuments = await _repository.GetItemsAsync(schema.CollectionName, filter);
        if (existingDocuments is null || existingDocuments.Count == 0)
            return MutationInputHelper.ActionResponseNotFound(OperationLabelUpdate);

        var input = MutationInputHelper.ParseMutationInput(context, inputType);
        ValidateBulkUpdateInputOrThrow(input, schema, existingDocuments);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelUpdate);
        var existingIds = existingDocuments
            .Select(d => d[GraphQlConstant.DbEntityIdFieldName]?.ToString())
            .OfType<string>()
            .ToList();
        await ValidateUniquenessOrThrowAsync(schema, [input], existingIds, OperationLabelUpdate);
        // One record the rules refuse refuses the whole update, so nothing is half done.
        ThrowIfColumnRulesRefuse(
            schema,
            existingDocuments.Select(document =>
                ((string?)$"Record {document[GraphQlConstant.DbEntityIdFieldName]}", RefusedOnEdit(schema, input, document))).ToList(),
            OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
        RecordOrganizationRule.EnsureForUpdate(input, _principals.Current);
        input.InjectDefaultValueOnUpdate();

        var document = InputToBsonDocument(input);
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter }, { "update", document } }.ToString();
        ActionResponse response;
        try
        {
            response = await _repository.UpdateManyAsync(schema.CollectionName, filter, document);
        }
        catch (Exception ex) when (TryGetDuplicateKeyFieldNames(ex, out var duplicateFields))
        {
            ThrowUniqueConstraintViolation(schema.SchemaName, OperationLabelUpdate, duplicateFields);
            throw;
        }
        List<UpdatedDocument>? updatedDocuments = null;
        if (response.Acknowledged)
        {
            var updatedFields = document.Elements
                .Select(e => new FieldChange { FieldName = e.Name, NewValue = e.Value?.ToString(), OldValue = null })
                .ToList();
            updatedDocuments = existingDocuments
                .Select(d => new UpdatedDocument
                {
                    DocumentId = d[GraphQlConstant.DbEntityIdFieldName]?.ToString() ?? string.Empty,
                    UpdatedFields = updatedFields
                })
                .ToList();
        }

        gatewayOperation.ResponseSize = document.ToBson().Length * existingDocuments.Count;
        gatewayOperation.DocumentCount = existingDocuments.Count;

        _logger.LogInformation("Data bulk updated for schema {SchemaName}", schema.SchemaName);

        await AfterWriteAsync(() => Task.WhenAll(
            updatedDocuments is null ? Task.CompletedTask : _eventPublisher.PublishAsync(schema, DataChangeOperation.Updated, updatedDocuments: updatedDocuments),
            NotifyBulkResultAsync(schema, "update", response.Acknowledged, response.TotalImpactedData)));
        return response;
    }

    /// <summary>
    /// Reference rules: every value sent to such a field (each element, for a list) must exist in the target
    /// schema's data. Must not exist in rules: it must not. One distinct query per lookup (target collection, field,
    /// filter and deleted-rows clause), whatever the number of inputs. The caller's access to the target schema is
    /// not applied: this is an existence check, like a foreign key. In a batch, ItemIds supplied by the batch itself
    /// count as existing for a Reference rule (rows may point at each other), when they match the rule's filter.
    /// </summary>
    private async Task ValidateReferencesOrThrowAsync(
        SchemaDefinitionExtended schema,
        IReadOnlyList<Dictionary<string, object?>> inputs,
        ReferenceTargets? references,
        string operationLabel)
    {
        const int maxErrors = 50;
        if (references is null || !references.HasReferences(schema)) return;
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Validation);

        var values = ReferenceValueCollector.Collect(inputs, schema, references);
        if (values.Count == 0) return;

        var batchRows = SuppliedRows(inputs);
        var result = new DataValidationResult();
        void Unchecked(ReferenceValue value)
        {
            if (result.Errors.Count < maxErrors)
                result.AddError(value.Path, ItemPrefix(value, inputs.Count > 1) + (string.IsNullOrWhiteSpace(value.Rule.ErrorMessage) ? DataValidationHelper.ConditionNotChecked : value.Rule.ErrorMessage), value.Rule.Type.ToString());
        }

        // Each rule's lookup condition is worked out once, however many values it checks.
        var conditions = new Dictionary<ValidationRule, (bool Built, BsonDocument? Condition, string Key)>(ReferenceEqualityComparer.Instance);
        var lookups = new List<(ReferenceValue Value, BsonDocument? Condition, string Key)>();
        foreach (var value in values)
        {
            if (!conditions.TryGetValue(value.Rule, out var built))
            {
                var ok = ReferenceLookup.TryCondition(value.Rule, out var condition);
                conditions[value.Rule] = built = (ok, condition, condition?.ToJson() ?? string.Empty);
            }
            if (built.Built)
                lookups.Add((value, built.Condition, built.Key));
            else
                Unchecked(value);
        }

        foreach (var group in lookups.GroupBy(l => (l.Value.Target.CollectionName, l.Value.Target.DbFieldName, l.Value.Target.IsSystemEntity, l.Key)))
        {
            var condition = group.First().Condition;
            HashSet<string> present;
            try
            {
                present = await PresentReferenceKeysAsync(group.Key.CollectionName, group.Key.DbFieldName, group.Key.IsSystemEntity, group.Select(l => l.Value), condition);
            }
            // A filter Mongo refuses (a pattern .NET reads but PCRE doesn't) fails its values instead of the write.
            catch (MongoCommandException) when (condition is not null)
            {
                foreach (var (value, _, _) in group)
                    Unchecked(value);
                continue;
            }
            bool Exists(ReferenceValue v) => present.Contains(WriteRules.ReferenceKey(BsonValue.Create(v.Value)));

            var mustExist = group.Select(l => l.Value).Where(v => v.Rule.Type == ValidationType.Reference);
            AddReferenceErrors(result, schema, mustExist.Where(v => !Exists(v) && !IsSuppliedByBatch(schema, v, batchRows, condition)), inputs.Count > 1, maxErrors);

            var mustNotExist = group.Select(l => l.Value).Where(v => v.Rule.Type == ValidationType.NotExistsIn);
            foreach (var value in mustNotExist.Where(Exists).TakeWhile(_ => result.Errors.Count < maxErrors))
                result.AddError(value.Path, ItemPrefix(value, inputs.Count > 1) + WriteRules.ReferenceFoundMessage(schema.SchemaName, value), nameof(ValidationType.NotExistsIn));
        }

        if (!result.IsValid)
        {
            _logger.LogWarning("Reference validation failed for {Op} on schema {SchemaName}: {Errors}",
                operationLabel, schema.SchemaName, result.ErrorMessage);
            MutationValidationHelper.ThrowValidationError(result);
        }
    }

    /// <summary>One error per missing value, up to <paramref name="maxErrors"/> in all; batches name the item.</summary>
    private static void AddReferenceErrors(DataValidationResult result, SchemaDefinitionExtended schema, IEnumerable<ReferenceValue> missing, bool isBatch, int maxErrors)
    {
        foreach (var value in missing.TakeWhile(_ => result.Errors.Count < maxErrors))
        {
            result.AddError(value.Path, ItemPrefix(value, isBatch) + WriteRules.ReferenceNotFoundMessage(schema.SchemaName, value), nameof(ValidationType.Reference));
        }
    }

    private static string ItemPrefix(ReferenceValue value, bool isBatch) => isBatch ? $"Item {value.InputIndex}: " : string.Empty;

    /// <summary>The rows the inputs supply themselves, by the ItemId they give (parsed input carries it as _id).</summary>
    private static Dictionary<string, List<Dictionary<string, object?>>> SuppliedRows(IReadOnlyList<Dictionary<string, object?>> inputs) =>
        inputs
            .Select(input => (Id: input.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var id) ? id?.ToString() : null, Input: input))
            .Where(row => row.Id is not null)
            .GroupBy(row => row.Id!, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Select(row => row.Input).ToList(), StringComparer.Ordinal);

    /// <summary>
    /// The keys of the values found in one target collection and field, among the rows that match the condition when
    /// there is one: one distinct query. Without a condition, exactly the lookup sent before rules could have one (G4).
    /// </summary>
    private async Task<HashSet<string>> PresentReferenceKeysAsync(string collectionName, string dbFieldName, bool systemEntity, IEnumerable<ReferenceValue> values, BsonDocument? condition)
    {
        var requested = values.Select(v => BsonValue.Create(v.Value)).Distinct().ToList();
        // A system entity's collection is in the tenant's default database, even on a custom data source.
        var existing = systemEntity
            ? await _repository.GetDistinctValuesInDefaultDatabaseAsync(collectionName, dbFieldName, requested, condition)
            : condition is null
                ? await _repository.GetDistinctValuesAsync(collectionName, dbFieldName, requested)
                : await _repository.GetDistinctValuesAsync(collectionName, dbFieldName, requested, condition);
        return existing.Select(WriteRules.ReferenceKey).ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>
    /// A batch row supplies the referenced ItemId of its own schema. With a filter, the row counts only when it
    /// matches it, as a stored row would.
    /// </summary>
    private static bool IsSuppliedByBatch(SchemaDefinitionExtended schema, ReferenceValue value, Dictionary<string, List<Dictionary<string, object?>>> batchRows, BsonDocument? condition)
    {
        if (batchRows.Count == 0
            || value.Target.CollectionName != schema.CollectionName
            || value.Target.DbFieldName != GraphQlConstant.DbEntityIdFieldName
            || value.Value.ToString() is not { } id || !batchRows.TryGetValue(id, out var rows))
            return false;
        return condition is null || rows.Any(row => BatchRowMatches(InputToBsonDocument(row), condition));
    }

    private static bool BatchRowMatches(BsonDocument row, BsonDocument condition)
    {
        try
        {
            return BsonFilterMatcher.Matches(row, condition);
        }
        // A filter the matcher can't run doesn't make the row count.
        catch (Exception ex) when (ex is NotSupportedException or ArgumentException)
        {
            return false;
        }
    }

    /// <summary>
    /// For each unique field in the schema, queries the DB with $in to find which values already exist.
    /// Returns fieldName → set of BsonValues already taken. One DB query per unique field.
    /// </summary>
    private async Task<Dictionary<string, HashSet<BsonValue>>> GetConflictingValuesAsync(
        SchemaDefinitionExtended schema,
        IReadOnlyList<Dictionary<string, object?>> inputs,
        IReadOnlyList<string>? excludeIds)
    {
        var conflicts = new Dictionary<string, HashSet<BsonValue>>();
        var uniqueFields = schema.Fields
            .Where(f => f.IsUniqueData && GraphQlTypeHelper.IsScalar(f.Type) && !f.IsArray)
            .ToList();
        if (uniqueFields.Count == 0) return conflicts;

        // Build per-field value sets (skip fields with no input values)
        var fieldValues = new Dictionary<string, List<BsonValue>>();
        foreach (var fieldDef in uniqueFields)
        {
            var values = inputs
                .Where(inp => inp.TryGetValue(fieldDef.Name, out var v) && v is not null)
                .Select(inp => BsonValue.Create(inp[fieldDef.Name]!))
                .Distinct()
                .ToList();
            if (values.Count > 0)
                fieldValues[fieldDef.Name] = values;
        }
        if (fieldValues.Count == 0) return conflicts;

        // Single $or query covering all unique fields — one DB round trip regardless of field count
        var orClauses = new BsonArray(
            fieldValues.Select(kv =>
                (BsonValue)new BsonDocument(kv.Key, new BsonDocument("$in", new BsonArray(kv.Value)))));

        var andClauses = new BsonArray
        {
            new BsonDocument("$or", orClauses)
        };
        if (excludeIds is not null && excludeIds.Count > 0)
            andClauses.Add(new BsonDocument(GraphQlConstant.DbEntityIdFieldName,
                new BsonDocument("$nin", new BsonArray(excludeIds.Select(id => BsonValue.Create(id))))));

        // Project only the unique fields needed to identify conflicts
        var projection = new BsonDocument(fieldValues.Keys.ToDictionary(k => k, _ => (object)1));

        // Upper bound: each distinct value can conflict with at most one existing document
        var limit = fieldValues.Values.Sum(v => v.Count);

        var existing = await _repository.GetItemsAsync(
            schema.CollectionName,
            new BsonDocument("$and", andClauses),
            sort: null,
            projection: projection,
            skip: 0,
            limit: limit);

        if (existing is null || existing.Count == 0) return conflicts;

        // Partition results by field in memory
        foreach (var fieldName in fieldValues.Keys)
        {
            var taken = existing
                .Where(doc => doc.Contains(fieldName))
                .Select(doc => doc[fieldName])
                .ToHashSet();
            if (taken.Count > 0)
                conflicts[fieldName] = taken;
        }
        return conflicts;
    }

    /// <summary>
    /// Validates uniqueness for one or more inputs; throws <see cref="GraphQLException"/> on any conflict.
    /// Checks intra-batch duplicates (in memory) and DB conflicts (one $in query per unique field).
    /// Pass excludeIds to exclude the documents being updated from the DB check.
    /// </summary>
    private async Task ValidateUniquenessOrThrowAsync(
        SchemaDefinitionExtended schema,
        IReadOnlyList<Dictionary<string, object?>> inputs,
        IReadOnlyList<string>? excludeIds,
        string operationLabel)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Validation);

        var uniqueFields = schema.Fields
            .Where(f => f.IsUniqueData && GraphQlTypeHelper.IsScalar(f.Type) && !f.IsArray)
            .ToList();
        if (uniqueFields.Count == 0) return;

        var result = new DataValidationResult();

        // Intra-batch duplicate check (only relevant when multiple inputs are provided)
        if (inputs.Count > 1)
        {
            foreach (var fieldDef in uniqueFields)
            {
                var seen = new HashSet<BsonValue>();
                foreach (var input in inputs)
                {
                    if (!input.TryGetValue(fieldDef.Name, out var v) || v is null) continue;
                    var bv = BsonValue.Create(v);
                    if (!seen.Add(bv))
                        result.AddError(fieldDef.Name,
                            $"Duplicate value for unique field '{fieldDef.Name}' found within the same batch.", "Unique");
                }
            }
        }

        // Single input applied to multiple documents: setting the same unique value on N > 1 records is itself a violation
        if (inputs.Count == 1 && excludeIds is not null && excludeIds.Count > 1)
        {
            foreach (var fieldDef in uniqueFields)
            {
                if (inputs[0].TryGetValue(fieldDef.Name, out var v) && v is not null)
                    result.AddError(fieldDef.Name,
                        $"Cannot set the same value for unique field '{fieldDef.Name}' on multiple records.", "Unique");
            }
        }

        // DB conflict check
        var conflictMap = await GetConflictingValuesAsync(schema, inputs, excludeIds);
        foreach (var input in inputs)
        {
            foreach (var (fieldName, takenValues) in conflictMap)
            {
                if (!input.TryGetValue(fieldName, out var fv) || fv is null) continue;
                if (takenValues.Contains(BsonValue.Create(fv)))
                    result.AddError(fieldName,
                        $"A record with the same value for '{fieldName}' already exists.", "Unique");
            }
        }

        if (!result.IsValid)
        {
            _logger.LogWarning("Uniqueness validation failed for {Op} on schema {SchemaName}: {Errors}",
                operationLabel, schema.SchemaName, result.ErrorMessage);
            MutationValidationHelper.ThrowValidationError(result);
        }
    }

    /// <summary>
    /// <see cref="ValidateUniquenessOrThrowAsync"/> only pre-checks fields flagged
    /// <c>IsUniqueData</c>. A unique index created directly on the Indexes tab (especially a
    /// compound one) has no such flag, so a duplicate value for it reaches MongoDB, which raises
    /// a driver-level duplicate-key error (E11000) on the write itself. This turns that raw
    /// exception into the same clean, field-level validation error the pre-check produces, so
    /// the client never sees an unformatted execution error for a condition we can name.
    /// </summary>
    private static readonly Regex DuplicateKeyDocumentRegex = new(
        @"dup key:\s*\{\s*(?<fields>.*)\}\s*$", RegexOptions.Compiled | RegexOptions.Singleline);
    private static readonly Regex DuplicateKeyFieldNameRegex = new(
        @"""?(?<name>[A-Za-z0-9_.]+)""?\s*:", RegexOptions.Compiled);

    private static bool TryGetDuplicateKeyFieldNames(Exception ex, out List<string> fieldNames)
    {
        fieldNames = [];
        var writeErrorMessage = ex switch
        {
            MongoWriteException { WriteError.Category: ServerErrorCategory.DuplicateKey } writeEx =>
                writeEx.WriteError.Message,
            MongoBulkWriteException<BsonDocument> bulkEx =>
                bulkEx.WriteErrors.FirstOrDefault(e => e.Category == ServerErrorCategory.DuplicateKey)?.Message,
            MongoCommandException cmdEx when cmdEx.Code == 11000 ||
                cmdEx.Message.Contains("E11000", StringComparison.OrdinalIgnoreCase) => cmdEx.Message,
            _ => null,
        };
        if (writeErrorMessage is null) return false;

        var match = DuplicateKeyDocumentRegex.Match(writeErrorMessage);
        if (match.Success)
        {
            fieldNames = DuplicateKeyFieldNameRegex.Matches(match.Groups["fields"].Value)
                .Select(m => m.Groups["name"].Value)
                .Distinct()
                .ToList();
        }
        return true;
    }

    [DoesNotReturn]
    private void ThrowUniqueConstraintViolation(string schemaName, string operationLabel, List<string> fieldNames)
    {
        var result = new DataValidationResult();
        if (fieldNames.Count > 0)
        {
            foreach (var fieldName in fieldNames)
                result.AddError(fieldName, $"A record with the same value for '{fieldName}' already exists.", "Unique");
        }
        else
        {
            result.AddError(string.Empty, "A record with the same value for a unique field already exists.", "Unique");
        }

        _logger.LogWarning("Unique constraint violation on {Op} for schema {SchemaName}: {Errors}",
            operationLabel, schemaName, result.ErrorMessage);
        MutationValidationHelper.ThrowValidationError(result);
    }

    private void PrepareMutation(SchemaDefinitionExtended schema, PolicyOperation operation, string operationLabel)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Policy);

        var rlsResult = EvaluateRlsPolicies(schema, operation);
        if (!rlsResult.IsAccessGranted)
        {
            _logger.LogWarning("Access denied for {Op} on schema {SchemaName}: {Error}",
                operationLabel.ToUpperInvariant(), schema.SchemaName, rlsResult.ErrorMessage);
            var message = rlsResult.ErrorMessage ?? $"You don't have permission to {operationLabel} records in this entity.";
            GatewayOperationActivity.MarkFailed(
                Activity.Current, GatewayFailureKind.Authorization, message, GraphQlConstant.ForbiddenErrorCode);

            throw new GraphQLException(
                ErrorBuilder.New().SetMessage(message).SetCode(GraphQlConstant.ForbiddenErrorCode).Build());
        }
    }

    private PolicyEvaluationResult EvaluateRlsPolicies(SchemaDefinitionExtended schema, PolicyOperation operation) =>
        _resolver.Check(new SchemaAccessRequest(_principals.Current, schema, operation));

    /// <summary>
    /// Fills properties the insert didn't send with their default values (before any check, so required
    /// fields can be satisfied by a default and defaults are validated like sent values). Returns the
    /// defaults so they can be put back after column access rules removed values the caller can't write.
    /// </summary>
    private List<FieldDefaultsApplier.DefaultAssignment> ApplyFieldDefaults(Dictionary<string, object?> input, SchemaDefinitionExtended schema, DateTime nowUtc)
    {
        if (!FieldDefaultsApplier.HasDefaults(schema.Fields))
            return [];
        var defaults = FieldDefaultsApplier.Compute(input, schema.SchemaName, schema.Fields, _principals.Current, nowUtc);
        FieldDefaultsApplier.Apply(input, defaults);
        return defaults;
    }

    private void ValidateMutationInputOrThrow(Dictionary<string, object?> input, SchemaDefinitionExtended schema, string operationLabel, DateTime nowUtc, BsonDocument? storedDocument = null)
    {

        ValidateRequiredFieldsOrThrow(input, schema, operationLabel);
        var r = input.Validate(schema, storedDocument is null ? null : WriteRules.ToRecord(storedDocument), nowUtc);
        if (!r.IsValid) { _logger.LogWarning("Validation failed for {Op} on schema {SchemaName}: {Errors}", operationLabel, schema.SchemaName, r.ErrorMessage); MutationValidationHelper.ThrowValidationError(r); }
    }

    /// <summary>
    /// Bulk update: the input is checked once, without a stored record, as before. Rules with an "only when" condition
    /// are then checked on each matched record (already loaded), and their errors name the record.
    /// </summary>
    private void ValidateBulkUpdateInputOrThrow(Dictionary<string, object?> input, SchemaDefinitionExtended schema, List<BsonDocument> existingDocuments)
    {
        ValidateRequiredFieldsOrThrow(input, schema, OperationLabelUpdate);
        var now = DateTime.UtcNow;
        var r = input.ValidateWithoutConditions(schema, now);
        if (HasConditionalRules(schema.Fields))
        {
            // At most 50 record errors, as for references: a bulk update over many records stops there.
            const int maxErrors = 50;
            foreach (var document in existingDocuments)
            {
                if (r.Errors.Count >= maxErrors)
                    break;
                var recordPrefix = $"Record {document[GraphQlConstant.DbEntityIdFieldName]}: ";
                foreach (var error in input.ValidateConditions(schema, WriteRules.ToRecord(document), now).Errors.Take(maxErrors - r.Errors.Count))
                    r.AddError(error.FieldName, recordPrefix + error.Message, error.ValidationType);
            }
        }
        if (!r.IsValid) { _logger.LogWarning("Validation failed for {Op} on schema {SchemaName}: {Errors}", OperationLabelUpdate, schema.SchemaName, r.ErrorMessage); MutationValidationHelper.ThrowValidationError(r); }
    }

    private static bool HasConditionalRules(List<FieldDefinitionResponse> fields) =>
        fields.Any(f => (f.ValidationRule?.Validations ?? []).Any(rule => rule.IsActive && rule.When is not null) || HasConditionalRules(f.Fields));

    private static void ValidateRequiredFieldsOrThrow(
        Dictionary<string, object?> input,
        SchemaDefinitionExtended schema,
        string operationLabel)
    {
        if (schema.SchemaType != SchemaType.Entity)
            return;

        var isInsert = operationLabel == OperationLabelCreate;
        var result = new DataValidationResult();
        ValidateRequiredFields(schema.Fields, input, string.Empty, isInsert, result);

        if (!result.IsValid)
            MutationValidationHelper.ThrowValidationError(result, "Required fields are missing or empty.");
    }

    private static void ValidateRequiredFields(
        IReadOnlyList<FieldDefinitionResponse> fields,
        IReadOnlyDictionary<string, object?>? input,
        string parentPath,
        bool isInsert,
        DataValidationResult result)
    {
        foreach (var field in fields)
        {
            var path = string.IsNullOrEmpty(parentPath) ? field.Name : $"{parentPath}.{field.Name}";
            object? value = null;
            var hasValue = input is not null && input.TryGetValue(field.Name, out value);
            var applies = field.RequiredOn == RequiredOn.Both ||
                          (isInsert && field.RequiredOn == RequiredOn.Insert) ||
                          (!isInsert && field.RequiredOn == RequiredOn.Update);

            if (applies && (!hasValue || IsEmptyRequiredValue(value)))
            {
                var operation = isInsert ? "insert" : "update";
                AddRequiredError(result, path, operation);
            }

            if (field.Fields.Count == 0)
                continue;

            if (!hasValue || value is null)
            {
                ValidateRequiredFields(field.Fields, null, path, isInsert, result);
                continue;
            }

            if (TryGetDictionary(value, out var nestedInput))
            {
                ValidateRequiredFields(field.Fields, nestedInput, path, isInsert, result);
                continue;
            }

            if (value is IEnumerable nestedItems && value is not string)
            {
                var foundNestedObject = false;
                foreach (var item in nestedItems)
                {
                    if (!TryGetDictionary(item, out var nestedItem)) continue;
                    foundNestedObject = true;
                    ValidateRequiredFields(field.Fields, nestedItem, path, isInsert, result);
                }
                if (!foundNestedObject)
                    ValidateRequiredFields(field.Fields, null, path, isInsert, result);
            }
        }
    }

    private static bool TryGetDictionary(object? value, out IReadOnlyDictionary<string, object?> dictionary)
    {
        if (value is IReadOnlyDictionary<string, object?> readOnly)
        {
            dictionary = readOnly;
            return true;
        }
        if (value is IDictionary<string, object?> mutable)
        {
            dictionary = new Dictionary<string, object?>(mutable);
            return true;
        }
        dictionary = null!;
        return false;
    }

    private static void AddRequiredError(DataValidationResult result, string path, string operation)
    {
        if (result.Errors.Any(error => error.FieldName == path && error.ValidationType == "Required"))
            return;
        result.AddError(path, $"Field '{path}' is required for {operation}.", "Required");
    }

    private static bool IsEmptyRequiredValue(object? value)
    {
        if (value is null) return true;
        if (value is string text) return string.IsNullOrWhiteSpace(text);
        if (value is IDictionary dictionary) return dictionary.Count == 0;
        if (value is IEnumerable enumerable)
        {
            var iterator = enumerable.GetEnumerator();
            try { return !iterator.MoveNext(); }
            finally { (iterator as IDisposable)?.Dispose(); }
        }
        return false;
    }

    /// <summary>
    /// Fields the client sent that a column rule for Create refuses, checked against the record as it will be stored:
    /// the rules may read CreatedBy, OrganizationId or the access lists, which are only filled in after this point.
    /// </summary>
    private List<string> RefusedOnInsert(SchemaDefinitionExtended schema, List<string> sentPaths, Dictionary<string, object?> input)
    {
        var record = WriteRules.ToRecord(InputToBsonDocument(input));
        record.InjectDefaultValueOnInsert();
        MutationInputHelper.EnsureDefaultListsForInsert(record);
        MutationInputHelper.AddRequesterToAccessLists(record, schema);
        return ClsWriteGuard.RefusedPaths(_principals.Current, schema, PolicyOperation.WRITE, sentPaths, record);
    }

    /// <summary>Fields whose value this update changes and that a column rule for Edit refuses on the stored record.</summary>
    private List<string> RefusedOnEdit(SchemaDefinitionExtended schema, Dictionary<string, object?> input, BsonDocument stored) =>
        ClsWriteGuard.RefusedPaths(_principals.Current, schema, PolicyOperation.EDIT, ClsWriteGuard.ChangedPaths(input, stored), WriteRules.ToRecord(stored));

    /// <summary>
    /// Refuses the whole write when a column rule refuses a field the client sent, naming each field (and, in a batch,
    /// the item or record), instead of dropping the field and reporting success. Nothing is written.
    /// </summary>
    private void ThrowIfColumnRulesRefuse(SchemaDefinitionExtended schema, IReadOnlyList<(string? Item, List<string> Fields)> refused, string operationLabel)
    {
        var verb = operationLabel == OperationLabelCreate ? "set" : "change";
        var result = new DataValidationResult();
        foreach (var (item, fields) in refused)
        {
            var prefix = item is null ? string.Empty : $"{item}: ";
            foreach (var field in fields.Select(MutationInputHelper.ToSchemaPath).Distinct())
                result.AddError(field, $"{prefix}You don't have permission to {verb} {field} on this record.", ColumnAccessValidationType);
        }
        if (result.IsValid)
            return;

        _logger.LogWarning("Column access refused for {Op} on schema {SchemaName}: {Errors}", operationLabel, schema.SchemaName, result.ErrorMessage);
        MutationValidationHelper.ThrowValidationError(result);
    }

    private void ApplyClsRestrictionsToInput(Dictionary<string, object?> input, SchemaDefinitionExtended schema, PolicyOperation operation, string operationLabel)
    {

        var restriction = _resolver.RestrictInput(new SchemaAccessRequest(_principals.Current, schema, operation), input);
        var removedFieldNames = restriction.RemovedFieldNames;
        if (removedFieldNames.Count > 0)
            _logger.LogInformation("CLS applied for {Op} on schema {SchemaName}. Restricted fields removed: {Fields}",
                operationLabel, schema.SchemaName, string.Join(", ", removedFieldNames));
    }

    private static BsonDocument InputToBsonDocument(Dictionary<string, object?> input) =>
        new BsonDocument(input.Select(kv => new BsonElement(kv.Key, BsonValue.Create(kv.Value))));

    /// <summary>
    /// Writes one <c>ObjectAuditLogs</c> row (<c>data-delete</c>, with the deleted doc in <c>Record</c>)
    /// per doc, through the same repository as the data (same DB as the old archive rows; data SPEC1 §3.3).
    /// Called before the delete: if it throws, the delete does not run (as today).
    /// </summary>
    private async Task SaveDeletedRecordAsync(
        SchemaDefinition schema,
        IReadOnlyList<BsonDocument> documentsToArchive)
    {
        if (documentsToArchive.Count == 0)
            return;

        var context = BlocksContext.GetContext();
        var userId = context?.UserId ?? string.Empty;
        var organizationId = context?.OrganizationId;
        var tenantId = TenantContext.GetTenantId();

        var auditRows = documentsToArchive
            .Select(doc => BuildDeletedRecordDocument(schema, doc, userId, tenantId, organizationId))
            .ToList();

        if (auditRows.Count == 1)
            await _repository.InsertAsync(AuditLogDocument.CollectionName, auditRows[0]);
        else
            await _repository.InsertManyAsync(AuditLogDocument.CollectionName, auditRows);
    }

    private static BsonDocument BuildDeletedRecordDocument(
        SchemaDefinition schema,
        BsonDocument sourceRecord,
        string userId,
        string tenantId,
        string? organizationId)
    {
        // ResourceId is the audit row's string field; the delete itself never uses this text.
        var recordId = sourceRecord.GetValue(GraphQlConstant.DbEntityIdFieldName, BsonNull.Value);
        var recordItemId = recordId.IsBsonNull ? string.Empty : recordId.ToString() ?? string.Empty;
        return AuditLogDocument.Build(
            action: AuditLogDocument.ActionDataDelete,
            resourceType: AuditLogDocument.ResourceTypeDataRecord,
            resourceId: recordItemId,
            userId: userId,
            tenantId: tenantId,
            detail: new Dictionary<string, string>
            {
                ["CollectionName"] = schema.CollectionName,
                ["SchemaName"] = schema.SchemaName,
                ["SchemaId"] = schema.ItemId ?? string.Empty
            },
            record: new BsonDocument(sourceRecord),
            organizationId: organizationId);
    }

    private async Task PublishUpdateEventAsync(SchemaDefinitionExtended schema, BsonDocument existingDocument, BsonDocument document, string itemId, bool acknowledged)
    {
        if (!acknowledged) return;
        var updatedFields = document.Elements
            .Select(e => new FieldChange
            {
                FieldName = e.Name,
                NewValue = e.Value?.ToString(),
                OldValue = existingDocument.Contains(e.Name) ? existingDocument[e.Name]?.ToString() : null
            })
            .ToList();
        await AfterWriteAsync(() => _eventPublisher.PublishAsync(schema, DataChangeOperation.Updated,
            updatedDocuments: new List<UpdatedDocument> { new() { DocumentId = itemId, UpdatedFields = updatedFields } }));
    }
}
