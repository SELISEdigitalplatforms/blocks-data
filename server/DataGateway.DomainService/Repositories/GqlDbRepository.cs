using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;
using StackExchange.Redis;

namespace DataGateway.DomainService.Repositories;

public class GqlDbRepository : IGqlDbRepository
{
    private readonly IDbContextProvider _dbContextProvider;
    private readonly ICacheClient _cacheClient;

    // Optional override used by tests; when set it short-circuits per-request tenant resolution.
    private IMongoDatabase? _overrideDatabase;

    public GqlDbRepository(IDbContextProvider dbContextProvider, ICacheClient cacheClient)
    {
        _dbContextProvider = dbContextProvider;
        _cacheClient = cacheClient;
    }



    #region Get


    public async Task<BsonDocument?> GetItemAsync(string collectionName, string id)
    {
        var filter = Builders<BsonDocument>.Filter.Eq(GraphQlConstant.DbEntityIdFieldName, id);
        return await GetItemAsync(collectionName, filter);
    }
    public async Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }


    public async Task<List<BsonDocument>> GetItemsAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsAsync(collection, filter, sort, projection, skip, limit);
    }




    public async Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10)
    {
        var db = GetDatabase();
        var collection = db.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsWithCountAsync(collection, filter, sort, projection, skip, limit);
    }

    #endregion

    #region Insert


    public async Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.InsertAsync(collection, data);
    }

    public async Task<BulkActionResponse> InsertManyAsync(string collectionName, List<BsonDocument> data)
    {
        if (data == null || data.Count == 0)
            return new BulkActionResponse { Acknowledged = true, TotalImpactedData = 0 };

        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        await collection.InsertManyAsync(data);
        var itemIds = data
            .Where(d => d.Contains(GraphQlConstant.DbEntityIdFieldName))
            .Select(d => d[GraphQlConstant.DbEntityIdFieldName].ToString() ?? string.Empty)
            .ToList();
        return new BulkActionResponse
        {
            Acknowledged = true,
            TotalImpactedData = data.Count,
            ItemIds = itemIds
        };
    }

    #endregion

    #region Update



    public async Task<ActionResponse> UpdateAsync(string collectionName,
        BsonDocument filter,
        BsonDocument data)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateOneAsync(collection, filter, data);
    }
    public async Task<ActionResponse> UpdateManyAsync(string collectionName,
            BsonDocument filter,
            BsonDocument data)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateManyAsync(collection, filter, data);
    }
    #endregion

    #region Delete


    public async Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteOneAsync(collection, filter);
    }
    public async Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter)
    {
        var collection = GetDatabase().GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteManyAsync(collection, filter);
    }

    #endregion

    #region Aggregation

    public async Task<List<CollectionsDataCount>> GetCollectionsDataCount(Dictionary<string, string> collectionToSchemaNameMap, FilterDefinition<BsonDocument>? filter = null)
    {
        var database = GetDatabase();

        var result = new List<CollectionsDataCount>();

        if (collectionToSchemaNameMap == null || !collectionToSchemaNameMap.Any())
            return result;

        // Render filter to BsonDocument if provided
        var filterBson = filter?.Render(new RenderArgs<BsonDocument>(
            BsonSerializer.SerializerRegistry.GetSerializer<BsonDocument>(),
            BsonSerializer.SerializerRegistry));

        var firstCollectionName = collectionToSchemaNameMap.Keys.First();

        var firstCollection = database.GetCollection<BsonDocument>(firstCollectionName);

        // Build aggregation pipeline for all collections in a single query
        var pipeline = GetUnionPipelines(collectionToSchemaNameMap, filterBson);

        // Execute aggregation - single database round trip
        var cursor = await firstCollection.AggregateAsync<BsonDocument>(pipeline);
        var aggregateResults = await cursor.ToListAsync();

        // Convert results to list of CollectionCount using SchemaName
        result = BuildCollectionDataCounts(aggregateResults, collectionToSchemaNameMap);

        return result;
    }

    #endregion

    /// <summary>
    /// Resolves the MongoDB database for the project being served by the current request.
    /// In a single-tenant deployment the tenant is fixed (environment), in the consolidated
    /// multi-project deployment it is carried per request through the request context.
    /// </summary>
    private IMongoDatabase GetDatabase()
    {
        if (_overrideDatabase != null)
        {
            return _overrideDatabase;
        }

        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            tenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty;
        }

        var (connectionString, dbName) = GetDatabaseInfo(tenantId);


        var database = (string.IsNullOrWhiteSpace(connectionString)
            ? _dbContextProvider.GetDatabase(tenantId)
            : _dbContextProvider.GetDatabase(connectionString, dbName, true))!;

        return database;
    }

    private (string ConnectionString, string DbName) GetDatabaseInfo(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            return (string.Empty, string.Empty);

        var cache = _cacheClient.GetHashValue(tenantId).ToDictionary(
            kv => kv.Name,
            kv => kv.Value
        );
        if (!cache.ContainsKey(nameof(DataServiceConfiguration.DbConnectionString)))
            return (string.Empty, string.Empty);

        var connectionStringByte = Convert.FromBase64String(cache[nameof(DataServiceConfiguration.DbConnectionString)]);
        var connectionString = System.Text.Encoding.UTF8.GetString(connectionStringByte);
        if (connectionString.IsNullOrWhiteSpaceOrDefault())
            return (string.Empty, string.Empty);

        var dbName = cache[nameof(DataServiceConfiguration.DatabaseName)];

        return (connectionString, dbName);

    }

    private static List<BsonDocument> GetInitialPipeline(Dictionary<string, string> collectionToSchemaNameMap, BsonDocument? filterBson = null)
    {
        var pipeline = new List<BsonDocument>();

        var firstCollName = collectionToSchemaNameMap.Keys.First();

        if (filterBson != null)
        {
            pipeline.Add(new BsonDocument("$match", filterBson));
        }

        pipeline.Add(new BsonDocument("$count", "count"));
        pipeline.Add(new BsonDocument("$addFields", new BsonDocument("collectionName", firstCollName)));

        return pipeline;
    }

    private static List<BsonDocument> GetUnionPipelines(Dictionary<string, string> collectionToSchemaNameMap, BsonDocument? filterBson = null)
    {
        var pipeline = GetInitialPipeline(collectionToSchemaNameMap, filterBson);

        var unionPipelines = new List<BsonDocument>();

        foreach (var collName in collectionToSchemaNameMap.Keys.Skip(1))
        {
            var unionPipeline = new BsonArray();

            if (filterBson != null)
            {
                unionPipeline.Add(new BsonDocument("$match", filterBson));
            }

            unionPipeline.Add(new BsonDocument("$count", "count"));
            unionPipeline.Add(new BsonDocument("$addFields", new BsonDocument("collectionName", collName)));

            unionPipelines.Add(new BsonDocument("$unionWith", new BsonDocument
            {
                { "coll", collName },
                { "pipeline", unionPipeline }
            }));
        }

        pipeline.AddRange(unionPipelines);

        return pipeline;
    }

    private static List<CollectionsDataCount> BuildCollectionDataCounts(List<BsonDocument> aggregateResults, Dictionary<string, string> collectionToSchemaNameMap)
    {
        var result = new List<CollectionsDataCount>();

        foreach (var doc in aggregateResults)
        {
            var collName = doc.GetValue("collectionName", BsonNull.Value).AsString;
            var count = doc.GetValue("count", 0).ToInt64();

            if (!string.IsNullOrEmpty(collName) && count > 0 && collectionToSchemaNameMap.ContainsKey(collName))
            {
                result.Add(new CollectionsDataCount
                {
                    CollectionName = collectionToSchemaNameMap[collName],
                    SchemaName = collName,
                    Count = count
                });
            }
        }

        return result;
    }
}
