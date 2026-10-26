using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis;
using DataGateway.DomainService.DataSources;
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
    /// <summary>Redis hash fields of a tenant's data source (data SPEC1 §3.5.8).</summary>
    public const string HashFieldSecretId = nameof(DataServiceConfiguration.DbConnectionSecretId);
    public const string HashFieldDatabaseName = nameof(DataServiceConfiguration.DatabaseName);
    public const string HashFieldConnectionType = "ConnectionType";
    public const string HashFieldVersion = "Version";
    public const string ConnectionTypeDefault = "Default";
    public const string ConnectionTypeCustom = "Custom";

    private readonly IDbContextProvider _dbContextProvider;
    private readonly ICacheClient _cacheClient;
    private readonly IDataSourceClientCache _clientCache;
    private readonly IDataSourceConfigStore _configStore;

    public GqlDbRepository(IDbContextProvider dbContextProvider, ICacheClient cacheClient, IDataSourceClientCache clientCache,
        IDataSourceConfigStore configStore)
    {
        _configStore = configStore;
        _dbContextProvider = dbContextProvider;
        _cacheClient = cacheClient;
        _clientCache = clientCache;
    }



    #region Get


    public async Task<BsonDocument?> GetItemAsync(string collectionName, string id)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var filter = Builders<BsonDocument>.Filter.Eq(GraphQlConstant.DbEntityIdFieldName, id);
        return await GetItemAsync(collectionName, filter);
    }
    public async Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await collection.Find(filter).FirstOrDefaultAsync();
    }


    public async Task<List<BsonDocument>> GetItemsAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsAsync(collection, filter, sort, projection, skip, limit);
    }




    /// <inheritdoc />
    public async Task<DocumentBatch> GetItemsBatchAsync(string collectionName,
        BsonDocument filter,
        BsonDocument sort,
        int maxDocs,
        long maxBytes)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        if (maxDocs < 1)
            maxDocs = 1;
        var collection = (await GetDatabaseAsync()).GetCollection<RawBsonDocument>(collectionName);
        var options = new FindOptions<RawBsonDocument> { BatchSize = maxDocs, Limit = maxDocs, Sort = sort };
        var batch = new DocumentBatch();
        using var cursor = await collection.FindAsync(new BsonDocumentFilterDefinition<RawBsonDocument>(filter), options);
        while (await cursor.MoveNextAsync())
        {
            var current = cursor.Current.ToList();
            for (var i = 0; i < current.Count; i++)
            {
                var raw = current[i];
                var size = raw.Slice.Length;
                // Always at least one doc; never more than maxBytes read into one batch.
                var full = batch.Documents.Count > 0 && batch.TotalBytes + size > maxBytes;
                if (!full)
                {
                    var bytes = new byte[size];
                    raw.Slice.GetBytes(0, bytes, 0, size);
                    batch.Add(BsonSerializer.Deserialize<BsonDocument>(bytes), size);
                }
                raw.Dispose();
                if (full || batch.Documents.Count >= maxDocs || batch.TotalBytes >= maxBytes)
                {
                    for (var j = i + 1; j < current.Count; j++)
                        current[j].Dispose();
                    return batch;
                }
            }
        }
        return batch;
    }

    public async Task<long> CountAsync(string collectionName, FilterDefinition<BsonDocument> filter)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await collection.CountDocumentsAsync(filter);
    }

    public async Task<List<BsonValue>> GetDistinctValuesAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values) =>
        await DistinctValuesAsync(await GetDatabaseAsync(), collectionName, fieldName, values, condition: null);

    public async Task<List<BsonValue>> GetDistinctValuesAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values, BsonDocument condition) =>
        await DistinctValuesAsync(await GetDatabaseAsync(), collectionName, fieldName, values, condition);

    public Task<List<BsonValue>> GetDistinctValuesInDefaultDatabaseAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values, BsonDocument? condition)
    {
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
            tenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty;
        return DistinctValuesAsync(_dbContextProvider.GetDatabase(tenantId)!, collectionName, fieldName, values, condition);
    }

    private static async Task<List<BsonValue>> DistinctValuesAsync(IMongoDatabase database, string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values, BsonDocument? condition)
    {
        // Chunked so a large bulk insert never builds one oversized $in.
        const int chunkSize = 5000;
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = database.GetCollection<BsonDocument>(collectionName);
        var found = new List<BsonValue>();
        foreach (var chunk in values.Chunk(chunkSize))
        {
            // Without a condition, exactly the lookup sent before rules could have one (G4).
            var filter = ReferenceLookup.Filter(fieldName, chunk, condition);
            using var cursor = await collection.DistinctAsync<BsonValue>(fieldName, filter);
            found.AddRange(await cursor.ToListAsync());
        }
        return found;
    }

    public async Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var db = await GetDatabaseAsync();
        var collection = db.GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.GetItemsWithCountAsync(collection, filter, sort, projection, skip, limit);
    }

    #endregion

    #region Insert


    public async Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.InsertAsync(collection, data);
    }

    public async Task<BulkActionResponse> InsertManyAsync(string collectionName, List<BsonDocument> data)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        if (data == null || data.Count == 0)
            return new BulkActionResponse { Acknowledged = true, TotalImpactedData = 0 };

        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
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
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateOneAsync(collection, filter, data);
    }
    public async Task<ActionResponse> UpdateManyAsync(string collectionName,
            BsonDocument filter,
            BsonDocument data)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.UpdateManyAsync(collection, filter, data);
    }
    #endregion

    #region Delete


    public async Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteOneAsync(collection, filter);
    }
    public async Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter)
    {
        using var _ = GatewayOperationActivity.Measure(GatewayPhase.Database);
        var collection = (await GetDatabaseAsync()).GetCollection<BsonDocument>(collectionName);
        return await MongoCollectionOperations.DeleteManyAsync(collection, filter);
    }

    #endregion

    #region Aggregation

    public async Task<List<CollectionsDataCount>> GetCollectionsDataCount(Dictionary<string, string> collectionToSchemaNameMap, FilterDefinition<BsonDocument>? filter = null)
    {
        var database = await GetDatabaseAsync();

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
    /// Resolves the MongoDB database for the project being served by the current request. Runs on every
    /// repository call and reads the tenant's Redis hash each time. Hash shape (written by the config service):
    /// <c>DbConnectionSecretId</c>, <c>DatabaseName</c>, <c>ConnectionType</c> (<c>Default</c>/<c>Custom</c>), <c>Version</c>.
    /// <list type="bullet">
    /// <item><c>Default</c> → the tenant's Blocks DB + release any open BYO client.</item>
    /// <item><c>Custom</c> → <see cref="IDataSourceClientCache"/> (the secret is read only on a miss).</item>
    /// <item>no hash, or a hash without those fields → rebuilt from the root doc + secret value (and written back);
    /// a missing root doc is created first (default doc + secret). Any failure fails closed.</item>
    /// </list>
    /// </summary>
    private async Task<IMongoDatabase> GetDatabaseAsync()
    {
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            tenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(tenantId))
            return _dbContextProvider.GetDatabase(tenantId)!;

        var route = await GetRouteAsync(tenantId);
        if (route.IsCustom)
            return await _clientCache.GetAsync(tenantId, route.SecretId, route.Version, route.DatabaseName, RequestAborted());

        _clientCache.Release(tenantId);
        return _dbContextProvider.GetDatabase(tenantId)!;
    }

    private static CancellationToken RequestAborted()
    {
        try
        {
            return BlocksHttpContextAccessor.Instance?.HttpContext?.RequestAborted ?? CancellationToken.None;
        }
        catch
        {
            return CancellationToken.None;
        }
    }

    private async Task<DataSourceRoute> GetRouteAsync(string tenantId)
    {
        var hash = (await _cacheClient.GetHashValueAsync(tenantId) ?? []).ToDictionary(
            kv => kv.Name.ToString(),
            kv => kv.Value.ToString());

        if (hash.TryGetValue(HashFieldSecretId, out var secretId) && !string.IsNullOrWhiteSpace(secretId)
            && hash.TryGetValue(HashFieldConnectionType, out var type)
            && (type == ConnectionTypeDefault || type == ConnectionTypeCustom))
        {
            return new DataSourceRoute(
                type == ConnectionTypeCustom,
                secretId,
                hash.TryGetValue(HashFieldDatabaseName, out var name) ? name : string.Empty,
                hash.TryGetValue(HashFieldVersion, out var version) ? version : string.Empty);
        }

        return await _configStore.LoadAsync(tenantId);
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
