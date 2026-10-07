using System.Globalization;
using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;

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

    private const string CollectionName = $"{nameof(SchemaPublishState)}s";

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
        var state = await _repository.GetItemAsync(CollectionName, SchemaPublishState.StateId, tenantId);
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

    public async Task<long> BumpAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName, SchemaPublishState.StateId);
        var update = new BsonDocument
        {
            { "$inc", new BsonDocument(nameof(SchemaPublishState.CurrentVersion), 1L) },
            { "$currentDate", new BsonDocument(nameof(SchemaPublishState.LastUpdatedDate), true) }
        };

        var state = await _repository.FindOneAndUpdateAsync(CollectionName, filter, update, isUpsert: true, tenantId);
        var version = ReadVersion(state);
        await CacheAsync(tenantId, version);
        return version;
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

    private static long ReadVersion(BsonDocument? state) =>
        state != null && state.TryGetValue(nameof(SchemaPublishState.CurrentVersion), out var value) && value.IsNumeric
            ? value.ToInt64()
            : 0;
}
