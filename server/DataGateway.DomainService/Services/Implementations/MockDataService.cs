using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class MockDataService : IMockDataService
{
    /// <summary>
    /// Collections per <see cref="IGqlDbRepository.GetCollectionsDataCount"/> call. That call builds one
    /// aggregation with a top-level $unionWith stage per collection, and MongoDB refuses pipelines over
    /// 1000 stages, so a large project is counted in batches of this size.
    /// </summary>
    internal const int CountBatchSize = 300;

    private readonly IGqlDbRepository _repository;
    private readonly IDbRepository _dbRepository;
    private readonly ILogger<MockDataService> _logger;

    public MockDataService(IGqlDbRepository repository, IDbRepository dbRepository, ILogger<MockDataService> logger)
    {
        _repository = repository;
        _dbRepository = dbRepository;
        _logger = logger;
    }

    public async Task<ServiceResponse<MockDataResponse>> GetMockData()
    {
        var response = new ServiceResponse<MockDataResponse>();

        // A missing IsDeleted counts as not deleted, hence $ne rather than == false.
        var schemaFilter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Eq(nameof(SchemaDefinition.SchemaType), 1),
            Builders<BsonDocument>.Filter.Ne(nameof(SchemaDefinition.IsSystemEntity), true),
            Builders<BsonDocument>.Filter.Ne(nameof(SchemaDefinition.IsDeleted), true));
        var projection = new BsonDocument
        {
            { nameof(SchemaDefinition.CollectionName), 1 },
            { nameof(SchemaDefinition.SchemaName), 1 }
        };

        // limit 0 = no limit: every entity schema of the project is considered.
        var schemas = await _dbRepository.GetItemsAsync($"{nameof(SchemaDefinition)}s", filter: schemaFilter, projection: projection, skip: 0, limit: 0);

        // One item per physical collection. MongoDB collection names are case-sensitive, so grouping is ordinal.
        // Field names stay swapped as the client expects: the map's value (shown) is the schema names.
        var collectionToSchemaNameMap = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var group in schemas
                     .Select(s => (Schema: s, CollectionName: StringOrNull(s, nameof(SchemaDefinition.CollectionName))))
                     .Where(x => !string.IsNullOrWhiteSpace(x.CollectionName))
                     .GroupBy(x => x.CollectionName!, StringComparer.Ordinal))
        {
            var schemaNames = group
                .Select(x => StringOrNull(x.Schema, nameof(SchemaDefinition.SchemaName)) ?? group.Key)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();
            collectionToSchemaNameMap.Add(group.Key, string.Join(", ", schemaNames));

            if (schemaNames.Count > 1)
                LogDuplicateCollection(group.Key, group.Select(x => x.Schema));
        }

        // Build filter for test data (Tags array contains "mock-data")
        var mockDataFilter = Builders<BsonDocument>.Filter.AnyEq($"{nameof(GraphQlBaseEntity.Tags)}", GraphQlConstant.MOCK_DATA_TAG);

        var mockDataInformation = new List<CollectionsDataCount>();
        foreach (var batch in collectionToSchemaNameMap.Chunk(CountBatchSize))
        {
            var batchMap = batch.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
            mockDataInformation.AddRange(await _repository.GetCollectionsDataCount(batchMap, mockDataFilter));
        }

        return response.SetSuccess(new MockDataResponse
        {
            Items = mockDataInformation,
        }).SetSuccessMessage("Test Data Retrieved Successfully");
    }

    private void LogDuplicateCollection(string collectionName, IEnumerable<BsonDocument> schemas)
    {
        // Ids only: no schema names or other customer data in the log.
        var schemaIds = schemas
            .Select(s => s.GetValue(GraphQlConstant.DbEntityIdFieldName, BsonNull.Value))
            .Where(id => !id.IsBsonNull)
            .Select(id => id.ToString())
            .ToList();
        _logger.LogWarning("Duplicate CollectionName {CollectionName} shared by schemas {SchemaIds} in tenant {TenantId}",
            collectionName, schemaIds, BlocksContext.GetContext()?.TenantId);
    }

    private static string? StringOrNull(BsonDocument document, string fieldName) =>
        document.TryGetValue(fieldName, out var value) && value.IsString ? value.AsString : null;

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
