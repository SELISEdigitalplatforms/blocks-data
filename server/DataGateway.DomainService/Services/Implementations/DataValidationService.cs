using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using DataGateway.DomainService.Helpers;
using MongoDB.Bson;
using MongoDB.Driver;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class DataValidationService : IDataValidationService
{
    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly ISchemaChangeLogService _schemaChangeLogService;

    public DataValidationService(IDbRepository repository, IRequestValidator requestValidator, ISchemaChangeLogService schemaChangeLogService)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _schemaChangeLogService = schemaChangeLogService ?? throw new ArgumentNullException(nameof(schemaChangeLogService));
    }

    public async Task<ServiceResponse<ActionResponse>> CreateDataValidationAsync(CreateDataValidationRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        // Check if validation already exists for this schema and field
        if (await IsValidationExistsForField(request.SchemaId, request.FieldName))
        {
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Validation already exists for this schema field")
                .SetHttpStatusCode(200);
        }

        var dataValidation = new DataValidation
        {
            SchemaId = request.SchemaId,
            FieldName = request.FieldName,
            Validations = request.Validations?.Select(v => v.MapToEntity()).ToList() ?? new List<ValidationRule>()
        };
        dataValidation.InjectDefaultValue();

        var result = await _repository.InsertAsync(dataValidation);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(request.SchemaId, SchemaChangeType.SchemaFieldValidationCreate);
        return new ServiceResponse<ActionResponse>().SetSuccess(
            new ActionResponse { Acknowledged = true, ItemId = result.ItemId }
        );
    }

    public async Task<ServiceResponse<ActionResponse>> UpdateDataValidationAsync(UpdateDataValidationRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var dataValidation = await _repository.GetItemAsync<DataValidation>(request.ItemId);

        if (dataValidation is null)
        {
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Data validation not found")
                .SetHttpStatusCode(200);
        }

        // Check if updating to a different field that already has validation
        if ((dataValidation.SchemaId != request.SchemaId || dataValidation.FieldName != request.FieldName) &&
            await IsValidationExistsForField(request.SchemaId, request.FieldName))
        {
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Validation already exists for this schema field")
                .SetHttpStatusCode(200);
        }

        dataValidation.SchemaId = request.SchemaId;
        dataValidation.FieldName = request.FieldName;
        dataValidation.Validations = request.Validations?.Select(v => v.MapToEntity()).ToList() ?? new List<ValidationRule>();
        dataValidation.InjectDefaultValue();

        var result = await _repository.UpdateAsync(dataValidation);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(request.SchemaId, SchemaChangeType.SchemaFieldValidationUpdate);

        return new ServiceResponse<ActionResponse>().SetSuccess(
            new ActionResponse { Acknowledged = true, ItemId = result.ItemId }
        );
    }

    public async Task<ServiceResponse<ActionResponse>> DeleteDataValidationAsync(string id)
    {
        var dataValidation = await _repository.GetItemAsync<DataValidation>(id);

        if (dataValidation is null)
        {
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Data validation not found")
                .SetHttpStatusCode(200);
        }

        var filter = Builders<DataValidation>.Filter.Eq(x => x.ItemId, id);
        var result = await _repository.DeleteAsync(filter);
        await _schemaChangeLogService.CreateSchemaChangeLogAsync(dataValidation.SchemaId, SchemaChangeType.SchemaFieldValidationDelete);

        return new ServiceResponse<ActionResponse>().SetSuccess(
            new ActionResponse { Acknowledged = true, ItemId = result.ItemId }
        );
    }

    public async Task<ServiceResponse<DataValidationResponse>> GetDataValidationByIdAsync(string id)
    {
        var dataValidation = await _repository.GetItemAsync<DataValidation>(id);

        if (dataValidation is null)
        {
            return new ServiceResponse<DataValidationResponse>()
                .SetErrorMessage("Data validation not found")
                .SetHttpStatusCode(200);
        }

        return new ServiceResponse<DataValidationResponse>().SetSuccess(dataValidation.MapToResponse());
    }

    public async Task<ServiceResponse<PaginationResponse<DataValidationResponse>>> GetAllDataValidationsAsync(GetDataValidationListRequest request)
    {
        var filter = GetFilter(request);
        var sort = GetSorting(request.SortBy, request.SortDescending);

        var result = await _repository.GetItemsWithCountAsync<DataValidation>(
            filter: filter,
            sort: sort,
            projection: null,
            skip: (request.PageNo - 1) * request.PageSize,
            limit: request.PageSize
        );

        var items = result.items.Select(x => x.MapToResponse()).ToList();

        return new ServiceResponse<PaginationResponse<DataValidationResponse>>().SetSuccess(
            new PaginationResponse<DataValidationResponse>(result.count, items)
        );
    }

    public async Task<ServiceResponse<List<DataValidationResponse>>> GetValidationsBySchemaIdAsync(string schemaId)
    {
        var filter = new BsonDocument
        {
            { nameof(DataValidation.SchemaId), schemaId }
        };

        var validations = await _repository.GetItemsAsync<DataValidation>(filter, null, null, 0, 1000);
        var items = validations.Select(x => x.MapToResponse()).ToList();

        return new ServiceResponse<List<DataValidationResponse>>().SetSuccess(items);
    }

    public async Task<ServiceResponse<DataValidationResponse>> GetValidationBySchemaAndFieldAsync(string schemaId, string fieldName)
    {
        var filter = Builders<DataValidation>.Filter.And(
            Builders<DataValidation>.Filter.Eq(x => x.SchemaId, schemaId),
            Builders<DataValidation>.Filter.Eq(x => x.FieldName, fieldName)
        );

        var dataValidation = await _repository.GetItemAsync(filter);

        if (dataValidation is null)
        {
            return new ServiceResponse<DataValidationResponse>()
                .SetErrorMessage("Data validation not found for this schema field")
                .SetHttpStatusCode(200);
        }

        return new ServiceResponse<DataValidationResponse>().SetSuccess(dataValidation.MapToResponse());
    }

    private async Task<bool> IsValidationExistsForField(string schemaId, string fieldName)
    {
        var filter = Builders<DataValidation>.Filter.And(
            Builders<DataValidation>.Filter.Eq(x => x.SchemaId, schemaId),
            Builders<DataValidation>.Filter.Eq(x => x.FieldName, fieldName)
        );

        var existing = await _repository.GetItemAsync(filter);
        return existing is not null;
    }

    private static BsonDocument GetFilter(GetDataValidationListRequest request)
    {
        var filter = new BsonDocument();

        if (!string.IsNullOrWhiteSpace(request.SchemaId))
        {
            filter.Add(nameof(DataValidation.SchemaId), request.SchemaId);
        }

        if (!string.IsNullOrWhiteSpace(request.FieldName))
        {
            filter.Add(nameof(DataValidation.FieldName), request.FieldName);
        }

        if (!string.IsNullOrWhiteSpace(request.Keyword))
        {
            filter.Add(nameof(DataValidation.FieldName), new BsonRegularExpression(request.Keyword, "i"));
        }

        return filter;
    }

    private static BsonDocument GetSorting(string sortBy, bool sortDescending)
    {
        var sort = new BsonDocument(nameof(DataValidation.CreatedDate), -1);
        if (!string.IsNullOrWhiteSpace(sortBy))
        {
            sort = new BsonDocument(sortBy, sortDescending ? -1 : 1);
        }
        return sort;
    }
}
