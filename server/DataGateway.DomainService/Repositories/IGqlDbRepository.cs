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

    /// <summary>
    /// Reads one bulk-delete batch with a cursor: <c>Find(filter).Sort(sort).Limit(maxDocs)</c>,
    /// <c>BatchSize = maxDocs</c>. Stops at <paramref name="maxDocs"/> docs or when the BSON bytes read
    /// reach <paramref name="maxBytes"/> (always at least one doc; a doc that would pass the cap is left
    /// for the next read). Returns the docs and their BSON sizes (data SPEC1 §3.3b).
    /// </summary>
    Task<DocumentBatch> GetItemsBatchAsync(string collectionName,
        BsonDocument filter,
        BsonDocument sort,
        int maxDocs,
        long maxBytes);

    /// <summary>Number of documents matching <paramref name="filter"/> (a scan; call only when needed).</summary>
    Task<long> CountAsync(string collectionName, FilterDefinition<BsonDocument> filter);

    /// <summary>
    /// Which of <paramref name="values"/> occur in <paramref name="fieldName"/> of <paramref name="collectionName"/>:
    /// a distinct over <c>{ field: { $in: values } }</c>, so a value shared by many documents is returned once.
    /// </summary>
    Task<List<BsonValue>> GetDistinctValuesAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values);

    /// <summary>
    /// As <see cref="GetDistinctValuesAsync(string, string, IReadOnlyCollection{BsonValue})"/>, counting only the rows that
    /// also match <paramref name="condition"/> (a Reference or Must not exist in rule's filter and deleted-rows clause).
    /// <see cref="GqlDbRepository"/> implements it. A repository that doesn't refuses the write rather than checking the
    /// rule without its condition.
    /// </summary>
    Task<List<BsonValue>> GetDistinctValuesAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values, BsonDocument condition) =>
        throw new NotSupportedException($"{GetType().Name} can't look values up with a condition.");

    /// <summary>
    /// The same lookup on a system entity's collection. The platform services write those into the tenant's default
    /// database, so it is read there even when the tenant's own records live on a custom data source.
    /// </summary>
    Task<List<BsonValue>> GetDistinctValuesInDefaultDatabaseAsync(string collectionName, string fieldName, IReadOnlyCollection<BsonValue> values, BsonDocument? condition) =>
        throw new NotSupportedException($"{GetType().Name} can't look values up in the default database.");

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

/// <summary>Docs of one bulk-delete batch with their BSON sizes (from the read; no second ToBson()).</summary>
public sealed class DocumentBatch
{
    public List<BsonDocument> Documents { get; } = new();
    public List<int> Sizes { get; } = new();
    public long TotalBytes { get; private set; }

    public void Add(BsonDocument document, int size)
    {
        Documents.Add(document);
        Sizes.Add(size);
        TotalBytes += size;
    }
}
