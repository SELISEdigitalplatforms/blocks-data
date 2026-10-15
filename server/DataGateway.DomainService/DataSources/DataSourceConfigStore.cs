using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using StackExchange.Redis;

namespace DataGateway.DomainService.DataSources;

/// <summary>Where a tenant's data lives, read from its Redis hash (or rebuilt from the root doc).</summary>
/// <param name="IsCustom"><c>false</c> = the tenant's Blocks DB; <c>true</c> = connect with the secret's value.</param>
public sealed record DataSourceRoute(bool IsCustom, string SecretId, string DatabaseName, string Version);

/// <summary>
/// The root data-source doc (<c>BlocksRootDb.DataServiceConfigurations</c>, <c>_id = TenantId</c>), its secret and the
/// tenant's Redis hash. One owner of the "first use" rule: no root doc → default root doc + default secret.
/// </summary>
public interface IDataSourceConfigStore
{
    /// <summary>The tenant's root doc, or null.</summary>
    Task<DataServiceConfiguration?> GetRootAsync(string tenantId, bool includeDeleted = false);

    /// <summary>
    /// The tenant's live root doc. No doc → creates the default doc (seed values) and a secret with the value
    /// <c>default</c>. Race-safe: insert-only; the loser of a parallel create deletes its own new secret.
    /// </summary>
    /// <exception cref="DataSourceUnavailableException">The doc is soft-deleted, or the secret store failed.</exception>
    Task<DataServiceConfiguration> EnsureRootAsync(string tenantId);

    /// <summary>
    /// Rebuilds the route from the root doc + secret value (hash missing or invalid) and writes the Redis hash.
    /// A broken or unreadable secret fails closed (never the Blocks DB).
    /// </summary>
    Task<DataSourceRoute> LoadAsync(string tenantId);

    /// <summary>Redis hash under <paramref name="key"/>: RemoveKey, then AddHash. Holds ids and names, never a value.</summary>
    Task WriteHashAsync(string key, string secretId, string databaseName, bool isCustom, DateTime lastUpdatedUtc);

    /// <summary>New <c>Service</c> secret named <c>data-source</c> with a plain value; returns its id.</summary>
    Task<string> SetSecretAsync(string tenantId, string value);

    /// <summary>Best effort delete of a secret this code created itself (never throws).</summary>
    Task DeleteOwnSecretAsync(string tenantId, string secretId);
}

public sealed class DataSourceConfigStore : IDataSourceConfigStore
{
    public const string CollectionName = "DataServiceConfigurations";
    public const string SecretName = "data-source";
    public const string SecretTag = "data";
    public const string SeedDatabaseName = "default";

    private readonly IDbRepository _repository;
    private readonly ICacheClient _cacheClient;
    private readonly IDataSourceSecretResolver _secretResolver;
    private readonly ILogger<DataSourceConfigStore> _logger;

    public DataSourceConfigStore(
        IDbRepository repository,
        ICacheClient cacheClient,
        IDataSourceSecretResolver secretResolver,
        ILogger<DataSourceConfigStore>? logger = null)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _cacheClient = cacheClient ?? throw new ArgumentNullException(nameof(cacheClient));
        _secretResolver = secretResolver ?? throw new ArgumentNullException(nameof(secretResolver));
        _logger = logger ?? NullLogger<DataSourceConfigStore>.Instance;
    }

    /// <summary>The version of a doc: its <c>LastUpdatedDate</c> in ms (Mongo precision), so every pod writes the same value.</summary>
    public static long VersionOf(DateTime lastUpdatedUtc) =>
        lastUpdatedUtc.Ticks - lastUpdatedUtc.Ticks % TimeSpan.TicksPerMillisecond;

    public async Task<DataServiceConfiguration?> GetRootAsync(string tenantId, bool includeDeleted = false)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            return null;
        var builder = Builders<DataServiceConfiguration>.Filter;
        var filter = builder.Eq(x => x.ItemId, tenantId);
        if (!includeDeleted)
            filter &= builder.Eq(x => x.IsDeleted, false);
        return await _repository.GetItemAsync(filter, GraphQlConstant.BlocksRootDbName);
    }

    public async Task<DataServiceConfiguration> EnsureRootAsync(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            throw new DataSourceUnavailableException("The tenant of this request is unknown.");

        var existing = await GetRootAsync(tenantId, includeDeleted: true);
        if (existing is not null)
            return Live(existing);

        var secretId = await SetSecretAsync(tenantId, DataSourceSecretResolver.DefaultValue);
        var root = Seed(tenantId, secretId);
        try
        {
            await _repository.InsertAsync(root, GraphQlConstant.BlocksRootDbName);
            _logger.LogInformation("[dsc] default-root-created tenant={TenantId}", tenantId);
            return root;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Another request created it first: drop our own secret, use the winner's doc.
            await DeleteOwnSecretAsync(tenantId, secretId);
            var winner = await GetRootAsync(tenantId, includeDeleted: true)
                ?? throw new DataSourceUnavailableException("The data source configuration of this project could not be created.", ex);
            return Live(winner);
        }
        catch
        {
            await DeleteOwnSecretAsync(tenantId, secretId);
            throw;
        }
    }

    public async Task<DataSourceRoute> LoadAsync(string tenantId)
    {
        var root = await EnsureRootAsync(tenantId);
        // Read the value to learn its kind; it is never kept or logged.
        var value = await _secretResolver.ResolveAsync(tenantId, root.DbConnectionSecretId);
        var isCustom = !value.IsNullOrWhiteSpaceOrDefault();
        value = null;

        await WriteHashAsync(tenantId, root.DbConnectionSecretId, root.DatabaseName, isCustom, root.LastUpdatedDate);
        return new DataSourceRoute(isCustom, root.DbConnectionSecretId, root.DatabaseName, VersionOf(root.LastUpdatedDate).ToString());
    }

    public async Task WriteHashAsync(string key, string secretId, string databaseName, bool isCustom, DateTime lastUpdatedUtc)
    {
        if (string.IsNullOrWhiteSpace(key))
            return;

        if (await _cacheClient.KeyExistsAsync(key))
            await _cacheClient.RemoveKeyAsync(key);

        await _cacheClient.AddHashValueAsync(key, [
            new HashEntry(GqlDbRepository.HashFieldSecretId, secretId),
            new HashEntry(GqlDbRepository.HashFieldDatabaseName, databaseName),
            new HashEntry(GqlDbRepository.HashFieldConnectionType, isCustom ? GqlDbRepository.ConnectionTypeCustom : GqlDbRepository.ConnectionTypeDefault),
            new HashEntry(GqlDbRepository.HashFieldVersion, VersionOf(lastUpdatedUtc))
        ]);
    }

    public Task<string> SetSecretAsync(string tenantId, string value) =>
        _secretResolver.ExecuteAsync(tenantId, s => s.SetAsync(new SetSecretRequest
        {
            Name = SecretName,
            Type = SecretTypes.Service,
            Tags = [SecretTag],
            OrganizationId = "default",
            Value = value
        }));

    public async Task DeleteOwnSecretAsync(string tenantId, string secretId)
    {
        try
        {
            await _secretResolver.ExecuteAsync(tenantId, async s =>
            {
                await s.DeleteAsync(secretId);
                return true;
            });
        }
        catch (Exception ex)
        {
            _logger.LogError("[dsc] own-secret-delete-failed tenant={TenantId} error={ErrorType}", tenantId, ex.GetType().Name);
        }
    }

    private static DataServiceConfiguration Live(DataServiceConfiguration root) =>
        root.IsDeleted
            ? throw new DataSourceUnavailableException("The data source configuration of this project is deleted.")
            : root;

    /// <summary>The default root doc of a new tenant: the seed doc values (contract).</summary>
    internal static DataServiceConfiguration Seed(string tenantId, string secretId)
    {
        var root = new DataServiceConfiguration
        {
            ItemId = tenantId,
            DbConnectionSecretId = secretId,
            DatabaseName = SeedDatabaseName,
            IsCollectionNameEditable = false,
            CollectionNamePattern = "sb_{SchemaName}s",
            ProjectKey = string.Empty,
            ProjectShortKey = string.Empty,
            AnalyticsConfiguration = null
        };
        root.InjectDefaultValue();
        root.TenantId = tenantId;
        root.OrganizationId = BlocksContext.GetContext()?.OrganizationId ?? root.OrganizationId;
        root.LastUpdatedDate = new DateTime(VersionOf(root.CreatedDate), DateTimeKind.Utc);
        return root;
    }
}
