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
    public const string HashFieldLegacyConnectionString = nameof(DataServiceConfiguration.DbConnectionString);
    public const string HashFieldDatabaseName = nameof(DataServiceConfiguration.DatabaseName);
    public const string HashFieldVersion = "Version";

    private readonly IDbContextProvider _dbContextProvider;
    private readonly ICacheClient _cacheClient;
    private readonly IDataSourceClientCache _clientCache;

    public GqlDbRepository(IDbContextProvider dbContextProvider, ICacheClient cacheClient, IDataSourceClientCache clientCache)
    {
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
    /// repository call and reads the tenant's Redis hash each time (as today; no pin). Hash shapes
    /// (data SPEC1 §3.5.5):
    /// <list type="bullet">
    /// <item><c>DbConnectionSecretId</c> = <c>""</c>/<c>"default"</c> → Blocks tenant DB + release any open BYO client;
    /// any other id → <see cref="IDataSourceClientCache"/> (a secret read only on a miss).</item>
    /// <item>only the legacy <c>DbConnectionString</c> (until scrub-redis) → today's decode + Genesis call.</item>
    /// <item>no hash → Blocks tenant DB.</item>
    /// </list>
    /// </summary>
    private async Task<IMongoDatabase> GetDatabaseAsync()
    {
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            tenantId = BlocksContext.GetContext()?.TenantId ?? string.Empty;
        }

        var info = await GetDatabaseInfoAsync(tenantId);
        switch (info.Kind)
        {
            case DataSourceKind.Secret:
                return await _clientCache.GetAsync(tenantId, info.Value, info.Version, info.DbName, RequestAborted());
            case DataSourceKind.LegacyConnectionString:
                _clientCache.Release(tenantId);
                return _dbContextProvider.GetDatabase(info.Value, info.DbName, true)!;
            case DataSourceKind.BlocksDefault:
                _clientCache.Release(tenantId);
                return _dbContextProvider.GetDatabase(tenantId)!;
            default:
                return _dbContextProvider.GetDatabase(tenantId)!;
        }
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

    private enum DataSourceKind { NoHash, BlocksDefault, Secret, LegacyConnectionString }

    private readonly record struct DataSourceInfo(DataSourceKind Kind, string Value, string DbName, string Version);

    private async Task<DataSourceInfo> GetDatabaseInfoAsync(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            return new DataSourceInfo(DataSourceKind.NoHash, string.Empty, string.Empty, string.Empty);

        var hash = (await _cacheClient.GetHashValueAsync(tenantId) ?? []).ToDictionary(
            kv => kv.Name.ToString(),
            kv => kv.Value.ToString());
        var dbName = hash.TryGetValue(HashFieldDatabaseName, out var name) ? name : string.Empty;

        if (hash.TryGetValue(HashFieldSecretId, out var secretId))
        {
            if (DataSourceSecretResolver.IsSentinel(secretId) || string.IsNullOrWhiteSpace(secretId))
                return new DataSourceInfo(DataSourceKind.BlocksDefault, string.Empty, dbName, string.Empty);
            var version = hash.TryGetValue(HashFieldVersion, out var v) ? v : string.Empty;
            return new DataSourceInfo(DataSourceKind.Secret, secretId, dbName, version);
        }

        if (!hash.TryGetValue(HashFieldLegacyConnectionString, out var legacy))
            return new DataSourceInfo(DataSourceKind.NoHash, string.Empty, string.Empty, string.Empty);

        var connectionString = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(legacy));
        if (connectionString.IsNullOrWhiteSpaceOrDefault())
            return new DataSourceInfo(DataSourceKind.BlocksDefault, string.Empty, dbName, string.Empty);

        return new DataSourceInfo(DataSourceKind.LegacyConnectionString, connectionString, dbName, string.Empty);
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
