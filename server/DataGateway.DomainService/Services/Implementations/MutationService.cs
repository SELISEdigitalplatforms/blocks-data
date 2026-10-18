using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
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
    private const string OperationLabelDelete = "DELETE";
    private readonly IGqlDbRepository _repository;
    private readonly IDataChangeEventPublisher _eventPublisher;
    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger<MutationService> _logger;

    public MutationService(
        IGqlDbRepository repository,
        IDataChangeEventPublisher eventPublisher,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger<MutationService> logger)
    {
        _repository = repository;
        _eventPublisher = eventPublisher;
        _resolver = resolver;
        _principals = principals;
        _logger = logger;
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
        var defaults = ApplyFieldDefaults(input, schema, DateTime.UtcNow);
        ValidateMutationInputOrThrow(input, schema, OperationLabelCreate);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelCreate);
        await ValidateUniquenessOrThrowAsync(schema, [input], null, OperationLabelCreate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
        FieldDefaultsApplier.Apply(input, defaults);
        input.InjectDefaultValueOnInsert();
        MutationInputHelper.EnsureDefaultListsForInsert(input);

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

        await _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted,
            dataDocuments: new List<BsonDocument> { document });

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
        ValidateMutationInputOrThrow(input, schema, OperationLabelUpdate, existingDocument);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelUpdate);
        var currentId = existingDocument[GraphQlConstant.DbEntityIdFieldName]?.ToString();
        await ValidateUniquenessOrThrowAsync(schema, [input], currentId is not null ? [currentId] : null, OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
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
            await _eventPublisher.PublishAsync(schema, DataChangeOperation.Deleted,
                dataDocuments: new List<BsonDocument> { firstDocument! });

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
                await _eventPublisher.PublishInChunksAsync(schema, DataChangeOperation.Deleted, batch.Documents);

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

        // One "now" for the whole batch, so every row's Now default is the same.
        var now = DateTime.UtcNow;
        var defaultsPerInput = inputs.Select(input => ApplyFieldDefaults(input, schema, now)).ToList();
        foreach (var input in inputs)
            ValidateMutationInputOrThrow(input, schema, OperationLabelCreate);

        await ValidateReferencesOrThrowAsync(schema, inputs, references, OperationLabelCreate);
        await ValidateUniquenessOrThrowAsync(schema, inputs, null, OperationLabelCreate);

        var documents = new List<BsonDocument>();
        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
            FieldDefaultsApplier.Apply(input, defaultsPerInput[i]);
            input.InjectDefaultValueOnInsert();
            MutationInputHelper.EnsureDefaultListsForInsert(input);
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
        if (response.Acknowledged && documents.Count > 0)
            await _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted, dataDocuments: documents);

        gatewayOperation.ResponseSize = documents.Sum(d => d.ToBson().Length);
        gatewayOperation.DocumentCount = documents.Count;

        _logger.LogInformation("Data bulk inserted for schema {SchemaName}", schema.SchemaName);

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
        ValidateMutationInputOrThrow(input, schema, OperationLabelUpdate);
        await ValidateReferencesOrThrowAsync(schema, [input], references, OperationLabelUpdate);
        var existingIds = existingDocuments
            .Select(d => d[GraphQlConstant.DbEntityIdFieldName]?.ToString())
            .OfType<string>()
            .ToList();
        await ValidateUniquenessOrThrowAsync(schema, [input], existingIds, OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
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
        if (response.Acknowledged)
        {
            var updatedFields = document.Elements
                .Select(e => new FieldChange { FieldName = e.Name, NewValue = e.Value?.ToString(), OldValue = null })
                .ToList();
            var updatedDocuments = existingDocuments
                .Select(d => new UpdatedDocument
                {
                    DocumentId = d[GraphQlConstant.DbEntityIdFieldName]?.ToString() ?? string.Empty,
                    UpdatedFields = updatedFields
                })
                .ToList();
            await _eventPublisher.PublishAsync(schema, DataChangeOperation.Updated, updatedDocuments: updatedDocuments);
        }

        gatewayOperation.ResponseSize = document.ToBson().Length * existingDocuments.Count;
        gatewayOperation.DocumentCount = existingDocuments.Count;

        _logger.LogInformation("Data bulk updated for schema {SchemaName}", schema.SchemaName);

        return response;
    }

    /// <summary>
    /// Reference rules: every value sent to such a field (each element, for a list) must exist in the target
    /// schema's data. One distinct query per target collection and field, whatever the number of inputs.
    /// The caller's access to the target schema is not applied: this is an existence check, like a foreign key.
    /// In a batch, ItemIds supplied by the batch itself count as existing (rows may point at each other).
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

        // Parsed input already carries a supplied ItemId as _id.
        var batchIds = inputs
            .Select(input => input.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var id) ? id?.ToString() : null)
            .OfType<string>()
            .ToHashSet(StringComparer.Ordinal);

        var result = new DataValidationResult();
        foreach (var group in values.GroupBy(v => (v.Target.CollectionName, v.Target.DbFieldName)))
        {
            var requested = group.Select(v => BsonValue.Create(v.Value)).Distinct().ToList();
            var existing = await _repository.GetDistinctValuesAsync(group.Key.CollectionName, group.Key.DbFieldName, requested);
            var present = existing.Select(WriteRules.ReferenceKey).ToHashSet(StringComparer.Ordinal);

            foreach (var value in group)
            {
                if (present.Contains(WriteRules.ReferenceKey(BsonValue.Create(value.Value)))) continue;
                if (IsSuppliedByBatch(schema, value, batchIds)) continue;
                if (result.Errors.Count >= maxErrors) break;

                var itemPrefix = inputs.Count > 1 ? $"Item {value.InputIndex}: " : string.Empty;
                result.AddError(value.Path, itemPrefix + WriteRules.ReferenceNotFoundMessage(schema.SchemaName, value), nameof(ValidationType.Reference));
            }
        }

        if (!result.IsValid)
        {
            _logger.LogWarning("Reference validation failed for {Op} on schema {SchemaName}: {Errors}",
                operationLabel, schema.SchemaName, result.ErrorMessage);
            MutationValidationHelper.ThrowValidationError(result);
        }
    }

    private static bool IsSuppliedByBatch(SchemaDefinitionExtended schema, ReferenceValue value, HashSet<string> batchIds) =>
        batchIds.Count > 0
        && value.Target.CollectionName == schema.CollectionName
        && value.Target.DbFieldName == GraphQlConstant.DbEntityIdFieldName
        && value.Value.ToString() is { } id && batchIds.Contains(id);

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
                Activity.Current, GatewayFailureKind.Authorization, message, GraphQlConstant.UnauthorizedErrorCode);

            throw new GraphQLException(
                ErrorBuilder.New().SetMessage(message).SetCode(GraphQlConstant.UnauthorizedErrorCode).Build());
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

    private void ValidateMutationInputOrThrow(Dictionary<string, object?> input, SchemaDefinitionExtended schema, string operationLabel, BsonDocument? storedDocument = null)
    {

        ValidateRequiredFieldsOrThrow(input, schema, operationLabel);
        var r = input.Validate(schema, storedDocument is null ? null : WriteRules.ToRecord(storedDocument));
        if (!r.IsValid) { _logger.LogWarning("Validation failed for {Op} on schema {SchemaName}: {Errors}", operationLabel, schema.SchemaName, r.ErrorMessage); MutationValidationHelper.ThrowValidationError(r); }
    }

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
        await _eventPublisher.PublishAsync(schema, DataChangeOperation.Updated,
            updatedDocuments: new List<UpdatedDocument> { new() { DocumentId = itemId, UpdatedFields = updatedFields } });
    }
}
