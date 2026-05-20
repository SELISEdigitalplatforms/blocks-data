using DataGateway.DomainService.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Repositories;

public interface IGqlDbRepository
{

    Task<BsonDocument?> GetItemAsync(string collectionName, string id);
    Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter);
    Task<List<BsonDocument>> GetItemsAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10);

    Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10);


    Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data);
    Task<BulkActionResponse> InsertManyAsync(string collectionName, List<BsonDocument> data);

    Task<ActionResponse> UpdateAsync(string collectionName, BsonDocument filter, BsonDocument data);
    Task<ActionResponse> UpdateManyAsync(string collectionName, BsonDocument filter, BsonDocument data);

    Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter);

    Task<List<CollectionsDataCount>> GetCollectionsDataCount(Dictionary<string, string> collectionToSchemaNameMap, FilterDefinition<BsonDocument>? filter = null);
    
    Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter);

}