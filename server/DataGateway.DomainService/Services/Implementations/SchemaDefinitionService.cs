using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using FluentValidation;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using SortDirection = DataGateway.DomainService.Models.SortDirection;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Service for CRUD operations on schema definitions and field definitions.
/// </summary>
public class SchemaDefinitionService : ISchemaDefinitionService
{
    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly ISchemaChangeLogService _schemaChangeLogService;
    private readonly SchemaDefinitionReferenceHelper _referenceHelper;
    private readonly ISchemaIndexService _schemaIndexService;
    private readonly ILogger<SchemaDefinitionService> _logger;

    public SchemaDefinitionService(
        IDbRepository repository,
        IRequestValidator requestValidator,
        IProjectService projectService,
        ISchemaChangeLogService schemaChangeLogService,
        SchemaDefinitionReferenceHelper referenceHelper,
        ISchemaIndexService schemaIndexService,
        ILogger<SchemaDefinitionService> logger)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _ = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _schemaChangeLogService = schemaChangeLogService ?? throw new ArgumentNullException(nameof(schemaChangeLogService));
        _referenceHelper = referenceHelper ?? throw new ArgumentNullException(nameof(referenceHelper));
        _schemaIndexService = schemaIndexService ?? throw new ArgumentNullException(nameof(schemaIndexService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> CreateSchemaAsync(CreateSchemaRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        if (await IsSchemaNameExistsAsync(request.SchemaName))
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Schema with the same name already exists").SetHttpStatusCode(400);

        var schema = new SchemaDefinition { CollectionName = request.CollectionName, SchemaName = request.SchemaName, SchemaType = request.SchemaType };
        schema.InjectDefaultValue();
        if (request.SchemaType == SchemaType.Entity)
            schema.AddDefaultFields();

        var result = await _repository.InsertAsync<SchemaDefinition>(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(result.ItemId, SchemaChangeType.SchemaCreate);
        _logger.LogInformation("Schema created: {SchemaName}, ItemId: {ItemId}", schema.SchemaName, result.ItemId);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = result.ItemId });
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> UpdateSchemaAsync(UpdateSchemaRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        var schema = await _repository.GetItemAsync<SchemaDefinition>(request.ItemId);
        if (schema is null)
            return SchemaNotFoundResponse();

        if (!await IsSchemaNameExistsAsync(request.SchemaName))
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Invalid schema name").SetHttpStatusCode(400);

        schema.CollectionName = request.CollectionName;
        schema.SchemaName = request.SchemaName;
        schema.SchemaType = request.SchemaType;
        schema.InjectDefaultValue();

        var result = await _repository.UpdateAsync(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaUpdate);
        _logger.LogInformation("Schema updated: {SchemaName}", schema.SchemaName);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = result.ItemId });
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> SaveFieldDefinitionAsync(SaveFieldDefinitionRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        var schema = await _repository.GetItemAsync<SchemaDefinition>(request.SchemaDefinitionItemId);
        if (schema == null)
            return SchemaNotFoundResponse();

        var indexesResponse = await _schemaIndexService.GetIndexesAsync(schema.ItemId);
        var existingIndexes = indexesResponse.Data?.Indexes ?? [];

        if (request.DeletableFieldNames?.Length > 0)
        {
            var blockingIndexNames = new List<string>();
            var autoManagedIndexesToDrop = new List<SchemaIndexResponse>();

            foreach (var deletedName in request.DeletableFieldNames)
            {
                foreach (var index in existingIndexes.Where(i => i.Fields.Any(f => f.FieldName == deletedName)))
                {
                    // A single-field unique index that exactly matches the field being deleted is
                    // this field's own IsUniqueData-managed index (see ReconcileUniqueFieldIndexesAsync)
                    // — it becomes moot once the field is gone, so it's dropped instead of blocking
                    // the deletion. Any other index (compound, or a deliberate non-unique index)
                    // still blocks, exactly as before.
                    if (IsAutoManagedUniqueIndex(index, deletedName))
                        autoManagedIndexesToDrop.Add(index);
                    else
                        blockingIndexNames.Add(index.Name);
                }
            }

            if (blockingIndexNames.Count > 0)
                return new ServiceResponse<ActionResponse>()
                    .SetErrorMessage($"FIELD_USED_BY_INDEX: {string.Join(", ", blockingIndexNames.Distinct())}")
                    .SetHttpStatusCode(400);

            foreach (var index in autoManagedIndexesToDrop.DistinctBy(i => i.ItemId))
            {
                await _schemaIndexService.DeleteIndexAsync(index.ItemId);
                existingIndexes.Remove(index);
            }

            schema.Fields = schema.Fields.Where(f => !request.DeletableFieldNames.Contains(f.Name)).ToList();
        }

        // Captured before the merge below overwrites IsUniqueData, so the reconciliation step can
        // tell an actual on/off transition apart from a field that was already (or still isn't)
        // unique — see ReconcileUniqueFieldIndexesAsync for why that distinction matters.
        var wasUniqueByFieldName = request.Fields.ToDictionary(
            f => f.Name,
            f => schema.Fields.FirstOrDefault(existing => existing.Name == f.Name)?.IsUniqueData ?? false);

        foreach (var field in request.Fields)
        {
            var existingField = schema.Fields.FirstOrDefault(f => f.Name == field.Name);
            if (existingField != null)
            {
                existingField.Type = field.Type;
                existingField.IsArray = field.IsArray;
                existingField.IsPIIData = field.IsPIIData;
                existingField.IsUniqueData = field.IsUniqueData;
                existingField.Description = field.Description;
                existingField.RequiredOn = field.RequiredOn;
            }
            else
                schema.Fields.Add(new FieldDefinition { Name = field.Name, Type = field.Type, IsArray = field.IsArray, IsPIIData = field.IsPIIData, IsUniqueData = field.IsUniqueData, Description = field.Description, RequiredOn = field.RequiredOn });
        }

        await _referenceHelper.AddReferenceInnerFieldsToSchemaAsync(schema);
        var result = await _repository.UpdateAsync(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaFieldUpdate);
        await ReconcileUniqueFieldIndexesAsync(schema, existingIndexes, request.Fields, wasUniqueByFieldName);
        await _referenceHelper.ApplyChangesToReferenceEntityFields(schema);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = schema.ItemId });
    }

    private static bool IsAutoManagedUniqueIndex(SchemaIndexResponse index, string fieldName) =>
        index.IsUnique && index.Fields.Count == 1 && index.Fields[0].FieldName == fieldName;

    /// <summary>
    /// Keeps a field's IsUniqueData flag in sync with a real MongoDB unique index on that field
    /// alone — but only in reaction to an actual on/off transition in this request, never by
    /// blanket-reconciling every field's current value. The frontend resubmits every field on
    /// every save, so scanning current values unconditionally would silently recreate an index a
    /// user had deliberately deleted from the Indexes tab the moment they saved any other field —
    /// deletion has to stay meaningful. Only applies to Entity schemas (Dto schemas have no backing
    /// data collection). Creation/deletion mechanics (field eligibility, the 15-index cap, duplicate
    /// detection, and the real MongoDB work) are entirely SchemaIndexService's responsibility — this
    /// method only decides *when* to call it. Per product decision, any failure it reports (a
    /// pre-existing duplicate index, the cap being reached, an ineligible field, or actual duplicate
    /// data in the collection) is skipped silently — the field save still succeeds, falling back to
    /// the existing app-level uniqueness check in MutationService.
    /// </summary>
    private async Task ReconcileUniqueFieldIndexesAsync(
        SchemaDefinition schema,
        List<SchemaIndexResponse> existingIndexes,
        List<FieldDefinitionRequest> touchedFields,
        Dictionary<string, bool> wasUniqueByFieldName)
    {
        if (schema.SchemaType != SchemaType.Entity)
            return;

        foreach (var touched in touchedFields)
        {
            var wasUnique = wasUniqueByFieldName.TryGetValue(touched.Name, out var prev) && prev;
            if (wasUnique == touched.IsUniqueData)
                continue; // steady state — no transition, nothing to reconcile

            var matchingIndex = existingIndexes.FirstOrDefault(i => IsAutoManagedUniqueIndex(i, touched.Name));

            if (!touched.IsUniqueData)
            {
                if (matchingIndex != null)
                {
                    await _schemaIndexService.DeleteIndexAsync(matchingIndex.ItemId);
                    existingIndexes.Remove(matchingIndex);
                }
                continue;
            }

            // Transitioned on. If a matching index already exists (e.g. created manually
            // beforehand), there's nothing to do.
            if (matchingIndex != null)
                continue;

            await _schemaIndexService.CreateIndexAsync(new CreateSchemaIndexRequest
            {
                SchemaDefinitionItemId = schema.ItemId,
                Fields = [new IndexFieldRequest { FieldName = touched.Name, Direction = SortDirection.ASC }],
                IsUnique = true
            });
        }
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> CreateSchemaDefinitionAsync(CreateSchemaDefinitionRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        if (await IsSchemaNameExistsAsync(request.SchemaName))
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Schema with the same name already exists").SetHttpStatusCode(400);

        var schema = new SchemaDefinition
        {
            CollectionName = request.CollectionName,
            Fields = request.Fields?.Select(f => new FieldDefinition { Name = f.Name, Type = f.Type, IsArray = f.IsArray, IsPIIData = f.IsPIIData, IsUniqueData = f.IsUniqueData, Description = f.Description, RequiredOn = f.RequiredOn }).ToList() ?? [],
            SchemaName = request.SchemaName,
            SchemaType = request.SchemaType
        };
        schema.InjectDefaultValue();
        if (request.SchemaType == SchemaType.Entity)
            schema.AddDefaultFields();

        await _referenceHelper.AddReferenceInnerFieldsToSchemaAsync(schema);
        var result = await _repository.InsertAsync<SchemaDefinition>(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaCreate);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = result.ItemId });
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> UpdateSchemaDefinitionAsync(UpdateSchemaDefinitionRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        var schema = await _repository.GetItemAsync<SchemaDefinition>(request.ItemId);
        if (schema == null)
            return SchemaNotFoundResponse();

        if (!await IsSchemaNameExistsAsync(request.SchemaName))
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Invalid schema name").SetHttpStatusCode(400);

        schema.CollectionName = request.CollectionName;
        schema.Fields = request.Fields?.Select(f => new FieldDefinition { Name = f.Name, Type = f.Type, IsArray = f.IsArray, IsPIIData = f.IsPIIData, IsUniqueData = f.IsUniqueData, Description = f.Description, RequiredOn = f.RequiredOn }).ToList() ?? [];
        schema.SchemaName = request.SchemaName;
        schema.SchemaType = request.SchemaType;
        schema.InjectDefaultValue();
        if (request.SchemaType == SchemaType.Entity)
            schema.AddDefaultFields();

        await _referenceHelper.AddReferenceInnerFieldsToSchemaAsync(schema);
        var result = await _repository.UpdateAsync(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaUpdate);
        await _referenceHelper.ApplyChangesToReferenceEntityFields(schema);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = result.ItemId });
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<ActionResponse>> DeleteSchemaAsync(string id)
    {
        var schema = await _repository.GetItemAsync<SchemaDefinition>(id);
        if (schema == null)
            return SchemaNotFoundResponse();

        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, id);
        var result = await _repository.DeleteAsync(filter);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaDelete);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = result.ItemId });
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<SchemaDefinitionResponse>> GetSchemaByIdAsync(string id)
    {
        var schema = await _repository.GetItemAsync<SchemaDefinition>(id);
        if (schema == null)
            return new ServiceResponse<SchemaDefinitionResponse>().SetErrorMessage("Schema not found").SetHttpStatusCode(204);

        var validations = await _repository.GetItemsAsync<DataValidation>(new BsonDocument { { nameof(DataValidation.SchemaId), schema.ItemId } }, null, null, 0, 1000);
        var policies = await _repository.GetItemsAsync<DataAccessPolicy>(new BsonDocument { { nameof(DataAccessPolicy.SchemaName), schema.SchemaName } }, null, null, 0, 1000);
        var response = schema.MapToResponse(policies, validations);
        await _referenceHelper.MapDtoSchemasReferencesToResponse(new List<SchemaDefinitionResponse> { response });
        return new ServiceResponse<SchemaDefinitionResponse>().SetSuccess(response);
    }

    /// <inheritdoc />
    public async Task<PaginationResponse<SchemaDefinitionResponse>> GetAllSchemasAsync(GetSchemaDefinitionListRequest request)
    {
        var filter = SchemaDefinitionFilterHelper.GetFilter(request);
        var sort = SchemaDefinitionFilterHelper.GetSorting(request.SortBy, request.SortDescending);
        var (items, total) = await _repository.GetItemsWithCountAsync<SchemaDefinition>(filter: filter, sort: sort, projection: null, skip: (request.PageNo - 1) * request.PageSize, limit: request.PageSize);
        var list = items.Select(s => s.MapToResponse()).ToList();
        await _referenceHelper.MapDtoSchemasReferencesToResponse(list);
        return new PaginationResponse<SchemaDefinitionResponse>(total, list);
    }

    /// <inheritdoc />
    public async Task<ServiceResponse<SchemaAggregationResponse>> GetSchemaAggregationAsync()
    {
        var pipeline = SchemaDefinitionFilterHelper.BuildAggregationPipeline();
        var doc = await _repository.AggregateOneAsync<SchemaDefinition>(pipeline);

        long Get(string key) => doc?.GetValue(key, 0).ToInt64() ?? 0;

        var read = new SchemaAccessLevelCounts { Public = Get("ReadPublic"), User = Get("ReadUser"), Custom = Get("ReadCustom") };
        var write = new SchemaAccessLevelCounts { Public = Get("WritePublic"), User = Get("WriteUser"), Custom = Get("WriteCustom") };
        var edit = new SchemaAccessLevelCounts { Public = Get("EditPublic"), User = Get("EditUser"), Custom = Get("EditCustom") };
        var delete = new SchemaAccessLevelCounts { Public = Get("DeletePublic"), User = Get("DeleteUser"), Custom = Get("DeleteCustom") };

        var aggregation = new SchemaAggregationResponse
        {
            Read = read,
            Write = write,
            Edit = edit,
            Delete = delete,
            TotalPublicPermission = read.Public + write.Public + edit.Public + delete.Public,
            TotalUserPermission = read.User + write.User + edit.User + delete.User,
            TotalCustomPermission = read.Custom + write.Custom + edit.Custom + delete.Custom,
        };

        return new ServiceResponse<SchemaAggregationResponse>().SetSuccess(aggregation);
    }

    /// <inheritdoc />
    public async Task<Dictionary<string, bool>> ResetSchemaStructureAsync(int pageNo = 1, int pageSize = 10)
    {
        var result = new Dictionary<string, bool>();
        var filter = new BsonDocument { { nameof(SchemaDefinition.SchemaType), SchemaType.Entity } };
        var schemaDefinitions = await _repository.GetItemsAsync<SchemaDefinition>(filter, null, null, 0, 1000);

        foreach (var schemaDefinition in schemaDefinitions)
        {
            _logger.LogInformation("Resetting schema: {SchemaName}", schemaDefinition.SchemaName);
            try
            {
                await _referenceHelper.AddReferenceInnerFieldsToSchemaAsync(schemaDefinition);
                await _repository.UpdateAsync(schemaDefinition);
                await _schemaChangeLogService.CreateSchemaChangeLogAsync(schemaDefinition.ItemId, SchemaChangeType.SchemaFieldUpdate);
                result.Add(schemaDefinition.SchemaName, true);
            }
            catch (Exception ex)
            {
                result.Add(schemaDefinition.SchemaName, false);
                _logger.LogError(ex, "Error resetting schema: {SchemaId} {SchemaName}", schemaDefinition.ItemId, schemaDefinition.SchemaName);
            }
        }
        return result;
    }


    public async Task<ServiceResponse<CollectionListResponse>> GetEntityCollectionsAsync()
    {
        var filter = new BsonDocument(nameof(SchemaDefinition.SchemaType), SchemaType.Entity);
        var schemas = await _repository.GetItemsAsync<SchemaDefinition>(filter, null, null, 0, 1000);

        var collections = schemas.Select(s => new CollectionSummaryResponse
        {
            Name = s.GetSchemaNameForProject(),
            CollectionName = s.CollectionName,
            Description = string.Empty,
            Type = SchemaType.Entity.ToString()
        }).ToList();

        return new ServiceResponse<CollectionListResponse>().SetSuccess(
            new CollectionListResponse { Collections = collections }
        );
    }

    public async Task<ServiceResponse<CollectionDetailResponse>> GetEntityCollectionByNameAsync(string projectSchemaName)
    {
        var filter = new BsonDocument
        {
            { nameof(SchemaDefinition.SchemaName), projectSchemaName },
            { nameof(SchemaDefinition.SchemaType), SchemaType.Entity }
        };
        var schemas = await _repository.GetItemsAsync<SchemaDefinition>(filter, null, null, 0, 1);
        var schema = schemas.FirstOrDefault();

        if (schema is null)
        {
            return new ServiceResponse<CollectionDetailResponse>()
                .SetErrorMessage("Collection not found")
                .SetHttpStatusCode(404);
        }

        var hierarchicalFields = SchemaDefinitionMapping.GetFieldDefinitionResponses(schema.Fields, [], [], "");

        return new ServiceResponse<CollectionDetailResponse>().SetSuccess(new CollectionDetailResponse
        {
            Name = schema.GetSchemaNameForProject(),
            CollectionName = schema.CollectionName,
            Description = string.Empty,
            Type = SchemaType.Entity.ToString(),
            Fields = hierarchicalFields.MapToCollectionFields()
        });
    }

    private async Task<bool> IsSchemaNameExistsAsync(string schemaName)
    {
        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.SchemaName, schemaName);
        var schema = await _repository.GetItemAsync(filter);
        return schema != null;
    }

    private static ServiceResponse<ActionResponse> SchemaNotFoundResponse() =>
        new ServiceResponse<ActionResponse>().SetErrorMessage("Schema not found").SetHttpStatusCode(204);
}
