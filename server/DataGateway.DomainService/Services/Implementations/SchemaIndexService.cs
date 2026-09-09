using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using MongoDB.Bson;
using MongoDB.Driver;
using SortDirection = DataGateway.DomainService.Models.SortDirection;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Manages MongoDB indexes defined on an Entity-type schema's data collection.
/// </summary>
public class SchemaIndexService : ISchemaIndexService
{
    /// <summary>Shared with SchemaDefinitionService's IsUniqueData auto-index reconciliation.</summary>
    internal const int MaxIndexesPerSchema = 15;

    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly ISchemaChangeLogService _schemaChangeLogService;

    public SchemaIndexService(
        IDbRepository repository,
        IRequestValidator requestValidator,
        ISchemaChangeLogService schemaChangeLogService)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _schemaChangeLogService = schemaChangeLogService ?? throw new ArgumentNullException(nameof(schemaChangeLogService));
    }

    public async Task<ServiceResponse<ActionResponse>> CreateIndexAsync(CreateSchemaIndexRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);

        var schema = await _repository.GetItemAsync<SchemaDefinition>(request.SchemaDefinitionItemId);
        if (schema == null)
            return new ServiceResponse<ActionResponse>().SetErrorMessage("SCHEMA_NOT_FOUND").SetHttpStatusCode(404);

        if (schema.SchemaType != SchemaType.Entity)
            return new ServiceResponse<ActionResponse>().SetErrorMessage("SCHEMA_TYPE_NOT_INDEXABLE").SetHttpStatusCode(400);

        var ineligibleFieldNames = request.Fields
            .Where(f => !IsFieldIndexable(schema, f.FieldName))
            .Select(f => f.FieldName)
            .ToList();
        if (ineligibleFieldNames.Count > 0)
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage($"FIELD_NOT_INDEXABLE: {string.Join(", ", ineligibleFieldNames)}")
                .SetHttpStatusCode(400);

        var existingIndexes = await GetIndexEntitiesAsync(schema.ItemId);
        if (existingIndexes.Count >= MaxIndexesPerSchema)
            return new ServiceResponse<ActionResponse>().SetErrorMessage("INDEX_LIMIT_REACHED").SetHttpStatusCode(400);

        var keys = request.Fields
            .Select(f => (f.FieldName, Direction: f.Direction == SortDirection.DESC ? -1 : 1))
            .ToList();
        var indexName = BuildIndexName(keys);

        if (existingIndexes.Any(i => i.Name == indexName))
            return new ServiceResponse<ActionResponse>().SetErrorMessage("INDEX_ALREADY_EXISTS").SetHttpStatusCode(409);

        try
        {
            await _repository.CreateIndexAsync(schema.CollectionName, keys, request.IsUnique, indexName);
        }
        catch (MongoCommandException ex) when (ex.Code == 11000 || ex.Message.Contains("E11000", StringComparison.OrdinalIgnoreCase))
        {
            return new ServiceResponse<ActionResponse>().SetErrorMessage("UNIQUE_INDEX_CONFLICT").SetHttpStatusCode(409);
        }

        var indexDefinition = new SchemaIndexDefinition
        {
            SchemaDefinitionItemId = schema.ItemId,
            Name = indexName,
            IsUnique = request.IsUnique,
            Fields = keys.Select(k => new IndexFieldSpec { FieldName = k.FieldName, Direction = k.Direction }).ToList()
        };
        var inserted = await _repository.InsertAsync(indexDefinition);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(schema.ItemId, SchemaChangeType.SchemaIndexCreate);

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = inserted.ItemId });
    }

    public async Task<ServiceResponse<SchemaIndexListResponse>> GetIndexesAsync(string schemaDefinitionItemId)
    {
        var schema = await _repository.GetItemAsync<SchemaDefinition>(schemaDefinitionItemId);
        if (schema == null)
            return new ServiceResponse<SchemaIndexListResponse>().SetErrorMessage("SCHEMA_NOT_FOUND").SetHttpStatusCode(404);

        var indexes = await GetIndexEntitiesAsync(schema.ItemId);
        var response = new SchemaIndexListResponse { Indexes = indexes.Select(MapToResponse).ToList() };
        return new ServiceResponse<SchemaIndexListResponse>().SetSuccess(response);
    }

    public async Task<ServiceResponse<ActionResponse>> DeleteIndexAsync(string itemId)
    {
        var indexDefinition = await _repository.GetItemAsync<SchemaIndexDefinition>(itemId);
        if (indexDefinition == null)
            return new ServiceResponse<ActionResponse>().SetErrorMessage("INDEX_NOT_FOUND").SetHttpStatusCode(404);

        var schema = await _repository.GetItemAsync<SchemaDefinition>(indexDefinition.SchemaDefinitionItemId);
        if (schema != null)
            await _repository.DropIndexAsync(schema.CollectionName, indexDefinition.Name);

        var filter = Builders<SchemaIndexDefinition>.Filter.Eq(x => x.ItemId, indexDefinition.ItemId);
        await _repository.DeleteAsync(filter);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(indexDefinition.SchemaDefinitionItemId, SchemaChangeType.SchemaIndexDelete);

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true, ItemId = indexDefinition.ItemId });
    }

    /// <summary>
    /// Eligible fields mirror the existing IsUniqueData filter in MutationService, minus its
    /// array exclusion: this feature explicitly supports multikey (array) indexes, only
    /// reference fields and non-scalar types are excluded.
    /// </summary>
    private static bool IsFieldIndexable(SchemaDefinition schema, string fieldName)
    {
        var field = schema.Fields.FirstOrDefault(f => f.Name == fieldName);
        return field != null && !field.IsReferenceField && GraphQlTypeHelper.IsScalar(field.Type);
    }

    private static string BuildIndexName(List<(string FieldName, int Direction)> keys) =>
        string.Join("_", keys.Select(k => $"{k.FieldName}_{k.Direction}"));

    private async Task<List<SchemaIndexDefinition>> GetIndexEntitiesAsync(string schemaDefinitionItemId)
    {
        var filter = new BsonDocument(nameof(SchemaIndexDefinition.SchemaDefinitionItemId), schemaDefinitionItemId);
        return await _repository.GetItemsAsync<SchemaIndexDefinition>(filter, null, null, 0, 1000);
    }

    private static SchemaIndexResponse MapToResponse(SchemaIndexDefinition index) => new()
    {
        ItemId = index.ItemId,
        Name = index.Name,
        IsUnique = index.IsUnique,
        CreatedDate = index.CreatedDate,
        Fields = index.Fields.Select(f => new IndexFieldResponse
        {
            FieldName = f.FieldName,
            Direction = f.Direction < 0 ? SortDirection.DESC : SortDirection.ASC
        }).ToList()
    };
}
