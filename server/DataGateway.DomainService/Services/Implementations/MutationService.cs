using Blocks.Genesis;
using DataGateway.DomainService.Entities;
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
using System.Collections;
using System.Diagnostics;

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
    private readonly ILogger<MutationService> _logger;

    public MutationService(
        IGqlDbRepository repository,
        IDataChangeEventPublisher eventPublisher,
        ILogger<MutationService> logger)
    {
        _repository = repository;
        _eventPublisher = eventPublisher;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<ActionResponse> InsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = schema.SchemaName;

        _logger.LogInformation("Inserting data for schema {SchemaName}", schema.SchemaName);
        PrepareMutation(schema, PolicyOperation.WRITE, OperationLabelCreate);
        var input = MutationInputHelper.ParseMutationInput(context, inputType);
        ValidateMutationInputOrThrow(input, schema, OperationLabelCreate);
        await ValidateUniquenessOrThrowAsync(schema, [input], null, OperationLabelCreate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
        input.InjectDefaultValueOnInsert();
        MutationInputHelper.EnsureDefaultListsForInsert(input);

        var document = InputToBsonDocument(input);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "insert", document } }.ToString();
        await _repository.InsertAsync(schema.CollectionName, document);
        var itemId = document[GraphQlConstant.DbEntityIdFieldName].ToString();

        await _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted,
            dataDocuments: new List<BsonDocument> { document });

        gatewayOperation.ResponseSize = document.ToBson().Length;

        _logger.LogInformation("Data inserted for schema {SchemaName}", schema.SchemaName);

        return new ActionResponse { Acknowledged = true, ItemId = itemId };
    }

    /// <inheritdoc />
    public async Task<ActionResponse> UpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
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
        ValidateMutationInputOrThrow(input, schema, OperationLabelUpdate);
        var currentId = existingDocument[GraphQlConstant.DbEntityIdFieldName]?.ToString();
        await ValidateUniquenessOrThrowAsync(schema, [input], currentId is not null ? [currentId] : null, OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
        input.InjectDefaultValueOnUpdate();

        var document = InputToBsonDocument(input);
        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter }, { "update", document } }.ToString();
        var response = await _repository.UpdateAsync(schema.CollectionName, filter, document);
        response.ItemId = existingDocument[GraphQlConstant.DbEntityIdFieldName]?.ToString();
        await PublishUpdateEventAsync(schema, existingDocument, document, response.ItemId ?? string.Empty, response.Acknowledged);

        gatewayOperation.ResponseSize = document.ToBson().Length;

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

        _logger.LogInformation("Data deleted for schema {SchemaName}", schema.SchemaName);

        return response;
    }

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
        var existingDocuments = await _repository.GetItemsAsync(schema.CollectionName, filter);
        if (existingDocuments is null || !existingDocuments.Any())
            return MutationInputHelper.ActionResponseNotFound(OperationLabelDelete);

        if (!MutationInputHelper.IsHardDeleteRequested(context, inputType))
        {
            await SaveDeletedRecordAsync(schema, existingDocuments);
        }
        var bulkResponse = await _repository.DeleteManyAsync(schema.CollectionName, filter);

        if (bulkResponse.Acknowledged)
            await _eventPublisher.PublishAsync(schema, DataChangeOperation.Deleted,
                dataDocuments: existingDocuments.ToList());

        gatewayOperation.ResponseSize = existingDocuments.Sum(d => d.ToBson().Length);

        _logger.LogInformation("Data bulk deleted for schema {SchemaName}", schema.SchemaName);

        return bulkResponse;
    }

    /// <inheritdoc />
    public async Task<BulkActionResponse> BulkInsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
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

        foreach (var input in inputs)
            ValidateMutationInputOrThrow(input, schema, OperationLabelCreate);

        await ValidateUniquenessOrThrowAsync(schema, inputs, null, OperationLabelCreate);

        var documents = new List<BsonDocument>();
        foreach (var input in inputs)
        {
            ApplyClsRestrictionsToInput(input, schema, PolicyOperation.WRITE, OperationLabelCreate);
            input.InjectDefaultValueOnInsert();
            MutationInputHelper.EnsureDefaultListsForInsert(input);
            documents.Add(InputToBsonDocument(input));
        }

        gatewayOperation.CollectionName = schema.CollectionName;
        gatewayOperation.MongoQuery = new BsonDocument { { "insertMany", new BsonArray(documents) } }.ToString();
        var response = await _repository.InsertManyAsync(schema.CollectionName, documents);
        if (response.Acknowledged && documents.Count > 0)
            await _eventPublisher.PublishAsync(schema, DataChangeOperation.Inserted, dataDocuments: documents);

        gatewayOperation.ResponseSize = documents.Sum(d => d.ToBson().Length);

        _logger.LogInformation("Data bulk inserted for schema {SchemaName}", schema.SchemaName);

        return response;
    }

    /// <inheritdoc />
    public async Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
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
        var existingIds = existingDocuments
            .Select(d => d[GraphQlConstant.DbEntityIdFieldName]?.ToString())
            .OfType<string>()
            .ToList();
        await ValidateUniquenessOrThrowAsync(schema, [input], existingIds, OperationLabelUpdate);
        ApplyClsRestrictionsToInput(input, schema, PolicyOperation.EDIT, OperationLabelUpdate);
        input.InjectDefaultValueOnUpdate();

        var document = InputToBsonDocument(input);
        gatewayOperation.MongoQuery = new BsonDocument { { "filter", filter }, { "update", document } }.ToString();
        var response = await _repository.UpdateManyAsync(schema.CollectionName, filter, document);
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

        _logger.LogInformation("Data bulk updated for schema {SchemaName}", schema.SchemaName);

        return response;
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

    private void PrepareMutation(SchemaDefinitionExtended schema, PolicyOperation operation, string operationLabel)
    {
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

    private PolicyEvaluationResult EvaluateRlsPolicies(SchemaDefinitionExtended schema, PolicyOperation operation)
    {
        var accessLevel = MutationInputHelper.GetSchemaAccessLevelForOperation(schema, operation);
        if (accessLevel != SchemaAccessLevel.Custom || RequestContextAccessor.Current.IsRequestFromBlocksCloud)
            return new PolicyEvaluationResult { IsAccessGranted = true };

        var rlsPolicies = schema.Policies.Where(p => p.PolicyType == PolicyType.RLS && p.Operation == operation).ToList();
        if (rlsPolicies.Count == 0)
            return new PolicyEvaluationResult { IsAccessGranted = false };

        return rlsPolicies.EvaluatePolicies(operation, PolicyType.RLS);
    }

    private void ValidateMutationInputOrThrow(Dictionary<string, object?> input, SchemaDefinitionExtended schema, string operationLabel)
    {
        ValidateRequiredFieldsOrThrow(input, schema, operationLabel);
        var r = input.Validate(schema);
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
        var allPaths = MutationInputHelper.GetAllPathsFromInput(input, prefix: "");
        var clsResult = MutationInputHelper.EvaluateClsPoliciesForInput(schema, operation, allPaths);
        var removedFieldNames = MutationInputHelper.RemoveExcludedPathsFromInput(input, clsResult.ExcludedFields);
        if (removedFieldNames.Count > 0)
            _logger.LogInformation("CLS applied for {Op} on schema {SchemaName}. Restricted fields removed: {Fields}",
                operationLabel, schema.SchemaName, string.Join(", ", removedFieldNames));
    }

    private static BsonDocument InputToBsonDocument(Dictionary<string, object?> input) =>
        new BsonDocument(input.Select(kv => new BsonElement(kv.Key, BsonValue.Create(kv.Value))));

    private async Task SaveDeletedRecordAsync(
        SchemaDefinition schema,
        IReadOnlyList<BsonDocument> documentsToArchive)
    {
        if (documentsToArchive.Count == 0)
            return;

        var archivedDocs = documentsToArchive
            .Select(doc => BuildDeletedRecordDocument(schema, doc))
            .ToList();

        if (archivedDocs.Count == 1)
            await _repository.InsertAsync($"{nameof(DataMutationRecord)}s", archivedDocs[0]);
        else
            await _repository.InsertManyAsync($"{nameof(DataMutationRecord)}s", archivedDocs);
    }

    private static BsonDocument BuildDeletedRecordDocument(SchemaDefinition schema, BsonDocument sourceRecord)
    {
        var recordItemId = sourceRecord.Contains(GraphQlConstant.DbEntityIdFieldName)
            ? sourceRecord[GraphQlConstant.DbEntityIdFieldName].ToString() ?? string.Empty
            : string.Empty;
        return new BsonDocument
        {
            { nameof(DataMutationRecord.CollectionName), schema.CollectionName },
            { nameof(DataMutationRecord.SchemaName), schema.SchemaName },
            { nameof(DataMutationRecord.SchemaId), schema.ItemId ?? string.Empty },
            { nameof(DataMutationRecord.RecordItemId), recordItemId },
            { nameof(DataMutationRecord.Operation), OperationLabelDelete },
            { nameof(DataMutationRecord.IsLatest), true },
            { nameof(DataMutationRecord.Record), new BsonDocument(sourceRecord) }
        };
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
