using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class DataManageService : IDataManageService
{
    private readonly IGqlDbRepository _repository;
    private readonly IDbRepository _dbRepository;
    public DataManageService(IGqlDbRepository repository, IDbRepository dbRepository)
    {
        _repository = repository;
        _dbRepository = dbRepository;
    }

    public async Task<ServiceResponse<MockDataResponse>> GetMockData()
    {
        var response = new ServiceResponse<MockDataResponse>();

        var schemaFilter = Builders<BsonDocument>.Filter.Eq(nameof(SchemaDefinition.SchemaType), 1);
        var projection = new BsonDocument
        {
            { nameof(SchemaDefinition.CollectionName), 1 },
            { nameof(SchemaDefinition.SchemaName), 1 },
            { GraphQlConstant.DbEntityIdFieldName, 0 }
        };

        var schemas = await _dbRepository.GetItemsAsync($"{nameof(SchemaDefinition)}s", filter: schemaFilter, projection: projection, skip: 0, limit: 300);

        var collectionToSchemaNameMap = schemas.ToDictionary(
            s => s.GetValue(nameof(SchemaDefinition.CollectionName), BsonNull.Value).AsString,
            s => s.GetValue(nameof(SchemaDefinition.SchemaName), s.GetValue(nameof(SchemaDefinition.CollectionName), BsonNull.Value).AsString).AsString
        );

        // Build filter for test data (Tags array contains "mock-data")
        var mockDataFilter = Builders<BsonDocument>.Filter.AnyEq($"{nameof(GraphQlBaseEntity.Tags)}", GraphQlConstant.MOCK_DATA_TAG);

        // Get test data details for all collections using aggregation
        var mockDataInformation = await _repository.GetCollectionsDataCount(collectionToSchemaNameMap, mockDataFilter);

        return response.SetSuccess(new MockDataResponse
        {
            Items = mockDataInformation,
        }).SetSuccessMessage("Test Data Retrieved Successfully");
    }

    public async Task<ServiceResponse<ActionResponse>> DeleteMockData(DeleteMockDataRequest request)
    {
        var schemaNames = request.SchemaNames;

        var response = new ServiceResponse<ActionResponse>();

        var mockDataFilter = new BsonDocument($"{nameof(GraphQlBaseEntity.Tags)}", GraphQlConstant.MOCK_DATA_TAG);

        var deletionTasks = schemaNames.Select(async schemaName =>
        {
            return await _repository.DeleteManyAsync(schemaName, mockDataFilter);
        });

        var results = await Task.WhenAll(deletionTasks);

        long totalDeleted = 0;

        bool allAcknowledged = true;

        foreach (var result in results)
        {
            totalDeleted += result.TotalImpactedData;
            allAcknowledged = allAcknowledged && result.Acknowledged;
        }

        return response.SetSuccess(new ActionResponse
        {
            Acknowledged = allAcknowledged,
            TotalImpactedData = totalDeleted,
            Message = $"Successfully deleted {totalDeleted} mock documents from collections"
        }).SetSuccessMessage("Mock Data Deleted Successfully");
    }
}
