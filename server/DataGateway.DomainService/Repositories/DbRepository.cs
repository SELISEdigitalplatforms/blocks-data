using System;
using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace DataGateway.DomainService.Repositories;

public class DbRepository : IDbRepository
{
    private readonly IDbContextProvider _dbContextProvider;
    private readonly IBlocksSecret _blocksSecret;
    private IMongoDatabase _database;
    public DbRepository(IDbContextProvider dbContextProvider, IBlocksSecret blocksSecret)
    {
        _dbContextProvider = dbContextProvider;
        _blocksSecret = blocksSecret;
    }

    #region Get

    public async Task<T?> GetItemAsync<T>(FilterDefinition<T> filter, string databaseName = "")
            where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";

        var collection = _database.GetCollection<T>(collectionName);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }
    public async Task<T?> GetItemAsync<T>(string id, string databaseName = "")
    where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";

        var collection = _database.GetCollection<T>(collectionName);
        var filter = Builders<T>.Filter.Eq(x => x.ItemId, id);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }


    public async Task<BsonDocument?> GetItemAsync(string collectionName, string id, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        var filter = Builders<BsonDocument>.Filter.Eq(GraphQlConstant.DbEntityIdFieldName, id);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }
    public async Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<List<T>> GetItemsAsync<T>(
        FilterDefinition<BsonDocument> filter,
        SortDefinition<BsonDocument>? sort = null,
        ProjectionDefinition<BsonDocument>? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        var query = collection.Find(filter);

        if (projection != null)
            query = query.Project(projection);

        if (sort != null)
            query = query.Sort(sort);

        var list = await query
            .Skip(skip)
            .Limit(limit)
            .ToListAsync();

        return list.Select(doc => BsonSerializer.Deserialize<T>(doc)).ToList();
    }

    public async Task<List<TResponse>> GetItemsAsync<TEntity, TResponse>(
        FilterDefinition<TEntity> filter,
        SortDefinition<TEntity>? sort = null,
        string databaseName = "") where TEntity : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(TEntity).Name}s";
        var collection = _database.GetCollection<TEntity>(collectionName);
        var query = collection.Find(filter);

        if (sort != null)
            query = query.Sort(sort);

        var items = await query
            .ToListAsync();

        return items.Select(item => BsonSerializer.Deserialize<TResponse>(item.ToBsonDocument())).ToList();
    }

    public async Task<List<BsonDocument>> GetItemsAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsAsync(collection, filter, sort, projection, skip, limit);
    }


    public async Task<(List<T> items, long count)> GetItemsWithCountAsync<T>(
        FilterDefinition<BsonDocument> filter,
        SortDefinition<BsonDocument>? sort = null,
        ProjectionDefinition<BsonDocument>? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        var query = collection.Find(filter);

        if (projection != null)
            query = query.Project(projection);

        if (sort != null)
            query = query.Sort(sort);

        var count = await query.CountDocumentsAsync();
        var list = await query
            .Skip(skip)
            .Limit(limit)
            .ToListAsync();

        var items = list.Select(doc => BsonSerializer.Deserialize<T>(doc)).ToList();
        return (items, count);
    }


    public async Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsWithCountAsync(collection, filter, sort, projection, skip, limit);
    }

    public async Task<BsonDocument?> AggregateOneAsync<T>(BsonDocument[] pipeline, string databaseName = "")
        where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await collection.Aggregate<BsonDocument>(pipeline).FirstOrDefaultAsync();
    }

    #endregion

    #region Insert
    // InsertAsync overloads
    public async Task<T> InsertAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        await collection.InsertOneAsync(data);
        return data;
    }
    public async Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.InsertAsync(collection, data);
    }
    // InsertManyAsync overloads
    public async Task<List<T>> InsertManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        await collection.InsertManyAsync(data);
        return data;
    }
    public async Task<List<BsonDocument>> InsertManyAsync(string collectionName, List<BsonDocument> data, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        await collection.InsertManyAsync(data);
        return data;
    }

    #endregion

    #region Update

    public async Task<ActionResponse> UpdateAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var filter = Builders<T>.Filter.Eq(x => x.ItemId, data.ItemId);

        var result = await collection.ReplaceOneAsync(filter, data);

        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.ModifiedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> UpdateAsync<T>(
        FilterDefinition<T> filter,
        T data,
        string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);

        var result = await collection.ReplaceOneAsync(filter, data);

        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.ModifiedCount
        };
        return actionResponse;
    }

    public async Task<ActionResponse> UpdateAsync(string collectionName,
        BsonDocument filter,
        BsonDocument data,
        string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateOneAsync(collection, filter, data);
    }
    public async Task<ActionResponse> UpdateManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var updates = new List<WriteModel<T>>();
        foreach (var item in data)
        {
            var filter = Builders<T>.Filter.Eq("_id", item.ItemId);
            updates.Add(new ReplaceOneModel<T>(filter, item));
        }
        var result = await collection.BulkWriteAsync(updates);
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.Upserts.Count + result.ModifiedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> UpdateManyAsync(string collectionName,
        BsonDocument filter,
        BsonDocument data,
        string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateManyAsync(collection, filter, data);
    }

    #endregion

    #region Delete
    // DeleteAsync overloads
    public async Task<ActionResponse> DeleteAsync<T>(FilterDefinition<T> filter, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var result = await collection.DeleteOneAsync(filter);
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.DeletedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteOneAsync(collection, filter);
    }
    // DeleteManyAsync overloads
    public async Task<ActionResponse> DeleteManyAsync<T>(FilterDefinition<T> filter, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var result = await collection.DeleteManyAsync(filter);
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.DeletedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteManyAsync(collection, filter);
    }
    #endregion

    #region Upsert
    public async Task<ActionResponse> UpsertAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var filter = Builders<T>.Filter.Eq(x => x.ItemId, data.ItemId);
        var result = await collection.ReplaceOneAsync(filter, data, new ReplaceOptions { IsUpsert = true });
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.ModifiedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> UpsertAsync(string collectionName, BsonDocument data, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        var filter = Builders<BsonDocument>.Filter.Eq(GraphQlConstant.DbEntityIdFieldName, data[GraphQlConstant.DbEntityIdFieldName]);
        var result = await collection.ReplaceOneAsync(filter, data, new ReplaceOptions { IsUpsert = true });
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.ModifiedCount
        };
        return actionResponse;
    }
    public async Task<ActionResponse> UpsertManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity
    {
        SetDatabase(databaseName);
        var collectionName = $"{typeof(T).Name}s";
        var collection = _database.GetCollection<T>(collectionName);
        var updates = new List<WriteModel<T>>();
        foreach (var item in data)
        {
            var filter = Builders<T>.Filter.Eq(x => x.ItemId, item.ItemId);
            var model = new ReplaceOneModel<T>(filter, item) { IsUpsert = true };
            updates.Add(model);
        }
        var result = await collection.BulkWriteAsync(updates);
        var actionResponse = new ActionResponse
        {
            Acknowledged = result.IsAcknowledged,
            TotalImpactedData = result.InsertedCount + result.ModifiedCount
        };
        return actionResponse;
    }
    #endregion

    #region Index
    public async Task<ActionResponse> CreateIndexAsync(string collectionName, List<(string FieldName, int Direction)> keys, bool isUnique, string indexName, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);

        var keysBuilder = Builders<BsonDocument>.IndexKeys;
        IndexKeysDefinition<BsonDocument> indexKeys = keys[0].Direction < 0
            ? keysBuilder.Descending(keys[0].FieldName)
            : keysBuilder.Ascending(keys[0].FieldName);
        for (var i = 1; i < keys.Count; i++)
        {
            indexKeys = keys[i].Direction < 0
                ? indexKeys.Descending(keys[i].FieldName)
                : indexKeys.Ascending(keys[i].FieldName);
        }

        var model = new CreateIndexModel<BsonDocument>(indexKeys, new CreateIndexOptions { Name = indexName, Unique = isUnique });
        await collection.Indexes.CreateOneAsync(model);

        return new ActionResponse { Acknowledged = true, ItemId = indexName };
    }

    public async Task<ActionResponse> DropIndexAsync(string collectionName, string indexName, string databaseName = "")
    {
        SetDatabase(databaseName);
        var collection = _database.GetCollection<BsonDocument>(collectionName);
        await collection.Indexes.DropOneAsync(indexName);
        return new ActionResponse { Acknowledged = true, ItemId = indexName };
    }
    #endregion

    #region Private Methods
    private DbRepository SetDatabase(string databaseName)
    {
        if (string.IsNullOrWhiteSpace(databaseName))
        {
            var database = _dbContextProvider.GetDatabase();
            if (database == null)
            {
                throw new InvalidOperationException("Database context provider returned null database.");
            }
            _database = database;
        }
        else if (databaseName == GraphQlConstant.BlocksRootDbName)
        {
            _database = _dbContextProvider.GetDatabase(_blocksSecret.DatabaseConnectionString,
                databaseName);
        }
        else
        {
            _database = _dbContextProvider.GetDatabase(databaseName);
        }

        return this;
    }
    #endregion
}
