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
/// tenant's Redis hash. READ-ONLY: blocks-os owns the config (create, save, Redis hash write). A missing root doc
/// fails closed (no create, no fallback).
/// </summary>
public interface IDataSourceConfigStore
{
    /// <summary>The tenant's root doc, or null.</summary>
    Task<DataServiceConfiguration?> GetRootAsync(string tenantId, bool includeDeleted = false);

    /// <summary>
    /// Rebuilds the route from the root doc + secret value (hash missing or invalid) and writes the Redis hash.
    /// A missing or deleted root doc, or a broken or unreadable secret, fails closed (never the Blocks DB).
    /// </summary>
    Task<DataSourceRoute> LoadAsync(string tenantId);
}

public sealed class DataSourceConfigStore : IDataSourceConfigStore
{
    public const string CollectionName = "DataServiceConfigurations";

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

    private async Task<DataServiceConfiguration> RequireRootAsync(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            throw new DataSourceUnavailableException("The tenant of this request is unknown.");

        var root = await GetRootAsync(tenantId, includeDeleted: true);
        if (root is null)
        {
            _logger.LogError("[dsc] root-doc-missing tenant={TenantId}", tenantId);
            throw new DataSourceUnavailableException("The data source configuration of this project does not exist. Configure it in the Blocks console.");
        }

        if (root.IsDeleted)
        {
            _logger.LogError("[dsc] root-doc-deleted tenant={TenantId}", tenantId);
            throw new DataSourceUnavailableException("The data source configuration of this project is deleted.");
        }

        return root;
    }

    public async Task<DataSourceRoute> LoadAsync(string tenantId)
    {
        var root = await RequireRootAsync(tenantId);
        // Read the value to learn its kind; it is never kept or logged.
        var value = await _secretResolver.ResolveAsync(tenantId, root.DbConnectionSecretId);
        var isCustom = !value.IsNullOrWhiteSpaceOrDefault();
        value = null;

        await WriteHashAsync(tenantId, root.DbConnectionSecretId, root.DatabaseName, isCustom, root.LastUpdatedDate);
        return new DataSourceRoute(isCustom, root.DbConnectionSecretId, root.DatabaseName, VersionOf(root.LastUpdatedDate).ToString());
    }

    private async Task WriteHashAsync(string key, string secretId, string databaseName, bool isCustom, DateTime lastUpdatedUtc)
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
}
