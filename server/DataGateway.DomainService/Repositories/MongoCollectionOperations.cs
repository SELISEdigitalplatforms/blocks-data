using DataGateway.DomainService.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Repositories;

internal static class MongoCollectionOperations
{
    internal static async Task<List<BsonDocument>> GetItemsAsync(
        IMongoCollection<BsonDocument> collection,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort,
        BsonDocument? projection,
        int skip,
        int limit)
    {
        var query = collection.Find(filter);
        if (projection != null)
            query = query.Project(projection);
        if (sort != null)
            query = query.Sort(sort);
        return await query.Skip(skip).Limit(limit).ToListAsync();
    }

    internal static async Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(
        IMongoCollection<BsonDocument> collection,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort,
        BsonDocument? projection,
        int skip,
        int limit)
    {
        var query = collection.Find(filter);
        if (projection != null)
            query = query.Project(projection);
        if (sort != null)
            query = query.Sort(sort);
        var count = await query.CountDocumentsAsync();
        var items = await query.Skip(skip).Limit(limit).ToListAsync();
        return (items, count);
    }

    internal static async Task<BsonDocument> InsertAsync(IMongoCollection<BsonDocument> collection, BsonDocument data)
    {
        await collection.InsertOneAsync(data);
        return data;
    }

    internal static async Task<ActionResponse> UpdateOneAsync(
        IMongoCollection<BsonDocument> collection,
        BsonDocument filter,
        BsonDocument data)
    {
        var update = new BsonDocument("$set", data);
        var result = await collection.UpdateOneAsync(filter, update);
        return new ActionResponse { Acknowledged = result.IsAcknowledged, TotalImpactedData = result.ModifiedCount };
    }

    internal static async Task<ActionResponse> UpdateManyAsync(
        IMongoCollection<BsonDocument> collection,
        BsonDocument filter,
        BsonDocument data)
    {
        var update = new BsonDocument("$set", data);
        var result = await collection.UpdateManyAsync(filter, update);
        return new ActionResponse { Acknowledged = result.IsAcknowledged, TotalImpactedData = result.ModifiedCount };
    }

    internal static async Task<ActionResponse> DeleteOneAsync(
        IMongoCollection<BsonDocument> collection,
        BsonDocument filter)
    {
        var result = await collection.DeleteOneAsync(filter);
        return new ActionResponse { Acknowledged = result.IsAcknowledged, TotalImpactedData = result.DeletedCount };
    }

    internal static async Task<ActionResponse> DeleteManyAsync(
        IMongoCollection<BsonDocument> collection,
        BsonDocument filter)
    {
        var result = await collection.DeleteManyAsync(filter);
        return new ActionResponse { Acknowledged = result.IsAcknowledged, TotalImpactedData = result.DeletedCount };
    }
}
