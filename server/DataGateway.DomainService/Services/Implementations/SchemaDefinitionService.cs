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
    private readonly ILogger<SchemaDefinitionService> _logger;

    public SchemaDefinitionService(
        IDbRepository repository,
        IRequestValidator requestValidator,
        IProjectService projectService,
        ISchemaChangeLogService schemaChangeLogService,
        SchemaDefinitionReferenceHelper referenceHelper,
        ILogger<SchemaDefinitionService> logger)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _ = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _schemaChangeLogService = schemaChangeLogService ?? throw new ArgumentNullException(nameof(schemaChangeLogService));
        _referenceHelper = referenceHelper ?? throw new ArgumentNullException(nameof(referenceHelper));
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

        if (request.DeletableFieldNames?.Length > 0)
            schema.Fields = schema.Fields.Where(f => !request.DeletableFieldNames.Contains(f.Name)).ToList();

        foreach (var field in request.Fields)
        {
            var existingField = schema.Fields.FirstOrDefault(f => f.Name == field.Name);
            if (existingField != null)
            {
                existingField.Type = field.Type;
                existingField.IsArray = field.IsArray;
                existingField.IsPIIData = field.IsPIIData;
                existingField.IsUniqueData = field.IsUniqueData;
                existingField.RequiredOn = field.RequiredOn;
                existingField.Description = field.Description;
            }
            else
                schema.Fields.Add(new FieldDefinition { Name = field.Name, Type = field.Type, IsArray = field.IsArray, IsPIIData = field.IsPIIData, IsUniqueData = field.IsUniqueData, RequiredOn = field.RequiredOn, Description = field.Description });
        }

        await _referenceHelper.AddReferenceInnerFieldsToSchemaAsync(schema);
        var result = await _repository.UpdateAsync(schema);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaFieldUpdate);
        await _referenceHelper.ApplyChangesToReferenceEntityFields(schema);
        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = schema.ItemId });
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
            Fields = request.Fields?.Select(f => new FieldDefinition { Name = f.Name, Type = f.Type, IsArray = f.IsArray, IsPIIData = f.IsPIIData, IsUniqueData = f.IsUniqueData, RequiredOn = f.RequiredOn, Description = f.Description }).ToList() ?? [],
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
        schema.Fields = request.Fields?.Select(f => new FieldDefinition { Name = f.Name, Type = f.Type, IsArray = f.IsArray, IsPIIData = f.IsPIIData, IsUniqueData = f.IsUniqueData, RequiredOn = f.RequiredOn, Description = f.Description }).ToList() ?? [];
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
