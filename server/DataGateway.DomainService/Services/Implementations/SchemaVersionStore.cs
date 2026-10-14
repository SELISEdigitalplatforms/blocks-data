using System.Globalization;
using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Services;

public class SchemaVersionStore : ISchemaVersionStore
{
    /// <summary>Redis channel on which a publish is announced to every pod.</summary>
    public const string ChannelName = "datagateway::schema-published";

    /// <summary>
    /// How long the Redis copy of a version lives. When it expires the next reader goes back to
    /// MongoDB, so a copy that missed an update is corrected within this time.
    /// </summary>
    public static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(60);

    /// <summary>
    /// The state doc (<c>_id "state"</c>) lives in the chunk collection (data SPEC1 §3.4). It has no
    /// <c>Version</c>, so chunk load/prune filters never match it.
    /// </summary>
    public const string CollectionName = "PublishedSchemaSnapshotChunks";

    /// <summary>Old home of the state doc. Only read, to seed the new doc once (rollout fallback).</summary>
    public const string LegacyCollectionName = "SchemaPublishStates";

    private readonly IDbRepository _repository;
    private readonly ICacheClient _cacheClient;
    private readonly ILogger<SchemaVersionStore> _logger;

    public SchemaVersionStore(IDbRepository repository, ICacheClient cacheClient, ILogger<SchemaVersionStore> logger)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _cacheClient = cacheClient ?? throw new ArgumentNullException(nameof(cacheClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public static string CacheKey(string tenantId) => $"datagateway::schema-version::{tenantId}";

    public async Task<long> GetAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var state = await EnsureStateAsync(tenantId);
        var version = ReadVersion(state);
        await CacheAsync(tenantId, version);
        return version;
    }

    public async Task<long> GetCachedAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            var cached = await _cacheClient.GetStringValueAsync(CacheKey(tenantId));
            if (long.TryParse(cached, NumberStyles.None, CultureInfo.InvariantCulture, out var version))
            {
                return version;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read the cached schema version for tenant {TenantId}; reading MongoDB", tenantId);
        }

        return await GetAsync(tenantId, cancellationToken);
    }

    public async Task<long> AllocateAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        // LastAllocatedVersion = max(LastAllocatedVersion, CurrentVersion) + 1, in one atomic update.
        // Tenants from before snapshots have only CurrentVersion, so numbering continues from it.
        var lastAllocated = $"${nameof(SchemaPublishState.LastAllocatedVersion)}";
        var current = $"${nameof(SchemaPublishState.CurrentVersion)}";
        var next = new BsonDocument("$add", new BsonArray
        {
            new BsonDocument("$max", new BsonArray
            {
                new BsonDocument("$ifNull", new BsonArray { lastAllocated, 0L }),
                new BsonDocument("$ifNull", new BsonArray { current, 0L })
            }),
            1L
        });
        var stage = new BsonDocument("$set", new BsonDocument
        {
            { nameof(SchemaPublishState.LastAllocatedVersion), next },
            { nameof(SchemaPublishState.LastUpdatedDate), "$$NOW" }
        });

        await EnsureStateAsync(tenantId);
        var state = await _repository.FindOneAndUpdateAsync(
            CollectionName, StateFilter, new PipelineUpdateDefinition<BsonDocument>(new[] { stage }), isUpsert: true, tenantId);
        return ReadLong(state, nameof(SchemaPublishState.LastAllocatedVersion));
    }

    public async Task<long> MakeCurrentAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        var update = new BsonDocument
        {
            { "$max", new BsonDocument(nameof(SchemaPublishState.CurrentVersion), version) },
            { "$currentDate", new BsonDocument(nameof(SchemaPublishState.LastUpdatedDate), true) }
        };

        await EnsureStateAsync(tenantId);
        var state = await _repository.FindOneAndUpdateAsync(CollectionName, StateFilter, update, isUpsert: true, tenantId);
        var currentVersion = ReadVersion(state);
        await CacheAsync(tenantId, currentVersion);
        return currentVersion;
    }

    public async Task SetCurrentAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        var update = new BsonDocument
        {
            { "$set", new BsonDocument(nameof(SchemaPublishState.CurrentVersion), version) },
            { "$currentDate", new BsonDocument(nameof(SchemaPublishState.LastUpdatedDate), true) }
        };

        await EnsureStateAsync(tenantId);
        await _repository.FindOneAndUpdateAsync(CollectionName, StateFilter, update, isUpsert: true, tenantId);
        await CacheAsync(tenantId, version);
    }

    public async Task AnnounceAsync(string tenantId, long version)
    {
        try
        {
            var message = JsonSerializer.Serialize(new SchemaVersionPublished(tenantId, version));
            await _cacheClient.PublishAsync(ChannelName, message);
        }
        catch (Exception ex)
        {
            // Pods that miss the message still find the new version on their next check.
            _logger.LogWarning(ex, "Could not announce schema version {Version} for tenant {TenantId}", version, tenantId);
        }
    }

    private async Task CacheAsync(string tenantId, long version)
    {
        try
        {
            await _cacheClient.AddStringValueAsync(
                CacheKey(tenantId),
                version.ToString(CultureInfo.InvariantCulture),
                (long)CacheLifetime.TotalSeconds);
        }
        catch (Exception ex)
        {
            // The copy expires on its own; until then pods may notice the new version a little later.
            _logger.LogWarning(ex, "Could not cache schema version {Version} for tenant {TenantId}", version, tenantId);
        }
    }

    /// <summary>
    /// Returns the state doc of the new collection. When it is missing and the old doc exists, seeds the
    /// new doc with <c>$max</c> of the old counters (only fields that exist; upsert). A DuplicateKey on that
    /// upsert (two pods at once) retries the update once. The old collection is only read.
    /// </summary>
    internal async Task<BsonDocument?> EnsureStateAsync(string tenantId)
    {
        var state = await _repository.GetItemAsync(CollectionName, SchemaPublishState.StateId, tenantId);
        if (state != null)
            return state;

        var legacy = await _repository.GetItemAsync(LegacyCollectionName, SchemaPublishState.StateId, tenantId);
        if (legacy == null)
            return null;

        var max = new BsonDocument();
        foreach (var field in new[] { nameof(SchemaPublishState.CurrentVersion), nameof(SchemaPublishState.LastAllocatedVersion) })
        {
            if (legacy.TryGetValue(field, out var value) && value.IsNumeric)
                max.Add(field, value.ToInt64());
        }
        if (max.ElementCount == 0)
            return null;

        var update = new BsonDocument("$max", max);
        try
        {
            state = await _repository.FindOneAndUpdateAsync(CollectionName, StateFilter, update, isUpsert: true, tenantId);
        }
        catch (Exception ex) when (IsDuplicateKey(ex))
        {
            state = await _repository.FindOneAndUpdateAsync(CollectionName, StateFilter, update, isUpsert: true, tenantId);
        }

        _logger.LogInformation("Schema version state of tenant {TenantId} seeded from {Legacy}", tenantId, LegacyCollectionName);
        return state;
    }

    private static bool IsDuplicateKey(Exception ex) => ex switch
    {
        MongoWriteException write => write.WriteError?.Category == ServerErrorCategory.DuplicateKey,
        MongoCommandException command => command.Code == 11000,
        _ => false
    };

    private static BsonDocument StateFilter => new(GraphQlConstant.DbEntityIdFieldName, SchemaPublishState.StateId);

    private static long ReadVersion(BsonDocument? state) => ReadLong(state, nameof(SchemaPublishState.CurrentVersion));

    private static long ReadLong(BsonDocument? state, string field) =>
        state != null && state.TryGetValue(field, out var value) && value.IsNumeric
            ? value.ToInt64()
            : 0;
}
