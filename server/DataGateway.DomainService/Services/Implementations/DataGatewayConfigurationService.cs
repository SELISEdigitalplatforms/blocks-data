using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Validators;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using StackExchange.Redis;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Data-source configuration (data SPEC1 §3.5.6). The source of truth is the ROOT doc
/// (<c>BlocksRootDb.DataServiceConfigurations</c>, <c>_id = TenantId</c>, connection string in a Blocks
/// <c>service</c> secret). The tenant copy is read only when there is no root doc, and the new code
/// writes only its non-secret fields (owner "Stop writing").
/// </summary>
public class DataGatewayConfigurationService : IDataGatewayConfigurationService
{
    public const string CollectionName = "DataServiceConfigurations";
    public const string SecretName = "data-source-connection";
    public const string SecretTag = "data";
    public const string NotMigratedMessage = "Data source not migrated yet. Ask ops to run the data migration job.";

    private readonly ICacheClient _cacheClient;
    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly IProjectService _projectService;
    private readonly IDataSourceSecretResolver _secretResolver;
    private readonly ILogger<DataGatewayConfigurationService> _logger;

    public DataGatewayConfigurationService(
        IDbRepository repository,
        ICacheClient cacheClient,
        IRequestValidator requestValidator,
        IProjectService projectService,
        IDataSourceSecretResolver secretResolver,
        ILogger<DataGatewayConfigurationService>? logger = null)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _cacheClient = cacheClient ?? throw new ArgumentNullException(nameof(cacheClient));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _projectService = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _secretResolver = secretResolver ?? throw new ArgumentNullException(nameof(secretResolver));
        _logger = logger ?? NullLogger<DataGatewayConfigurationService>.Instance;
    }

    #region Get

    public async Task<ServiceResponse<DataGatewayConfigurationResponse>> GetConfiguration(string projectKey)
    {
        var tenantId = TenantContext.GetTenantId();
        var root = await GetRootDocAsync(tenantId);

        DataServiceConfiguration? source;
        string connectionString;
        string itemId;
        if (root is not null)
        {
            source = root;
            itemId = root.ConfigItemId ?? string.Empty;
            connectionString = await ResolveForGetAsync(tenantId, root.DbConnectionSecretId);
        }
        else
        {
            // No root doc: today's code on the tenant copy.
            source = await GetTenantCopyAsync();
            if (source is null)
                return new ServiceResponse<DataGatewayConfigurationResponse>().SetErrorMessage("Data source not found.");
            itemId = source.ItemId;
            connectionString = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(source.DbConnectionString!));
        }

        var projectShortKey = await _projectService.GetTenantSlugAsync(projectKey);
        var response = new DataGatewayConfigurationResponse
        {
            DbConnectionString = connectionString,
            DatabaseName = source.DatabaseName,
            IsCollectionNameEditable = source.IsCollectionNameEditable,
            CollectionNamePattern = source.CollectionNamePattern,
            ProjectKey = projectKey,
            ProjectShortKey = projectShortKey,
            ItemId = itemId,
            AnalyticsConfiguration = new AnalyticsConfigurationResponse
            {
                EnableAnalytics = source.AnalyticsConfiguration?.EnableAnalytics ?? false,
                EnableDate = source.AnalyticsConfiguration?.EnableDate,
                ValidTill = source.AnalyticsConfiguration?.ValidTill
            }
        };

        return new ServiceResponse<DataGatewayConfigurationResponse>().SetSuccess(response);
    }

    /// <summary>
    /// Value for the GET answer. A locked, deleted or missing secret, or an active one whose vault value is
    /// gone, answers <c>""</c> (repair path: the CLI GETs before every save); any other secret error fails.
    /// </summary>
    private async Task<string> ResolveForGetAsync(string tenantId, string? secretId)
    {
        if (secretId is null)
            return string.Empty;
        if (DataSourceSecretResolver.IsSentinel(secretId))
            return secretId;

        SecretResult? metadata;
        try
        {
            metadata = await _secretResolver.ExecuteAsync(tenantId, s => s.GetAsync(secretId));
        }
        catch (Exception ex) when (ex is not DataSourceUnavailableException)
        {
            _logger.LogWarning("[dsc] get-secret-failed tenant={TenantId} secret={SecretId} error={ErrorType}",
                tenantId, secretId, ex.GetType().Name);
            throw new DataSourceUnavailableException(ex.Message, ex);
        }

        var unusable = metadata is null ? "missing"
            : metadata.Status == SecretStatuses.Locked ? "locked"
            : metadata.Status == SecretStatuses.Deleted ? "deleted"
            : null;
        if (unusable is not null)
        {
            _logger.LogWarning("[dsc] get-secret-unusable tenant={TenantId} state={State}", tenantId, unusable);
            return string.Empty;
        }

        try
        {
            return await _secretResolver.ResolveAsync(tenantId, secretId) ?? string.Empty;
        }
        catch (DataSourceUnavailableException ex) when (ex.SecretError is SecretNotFoundException)
        {
            _logger.LogWarning("[dsc] get-secret-unusable tenant={TenantId} state={State}", tenantId, "value-missing");
            return string.Empty;
        }
    }

    #endregion

    #region Insert

    public async Task<ServiceResponse<ActionResponse>> InsertConfiguration(CreateDataGatewayConfigurationRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var tenantId = TenantContext.GetTenantId();
        if (await GetRootDocAsync(tenantId, includeDeleted: true) is not null || await GetTenantCopyAsync() is not null)
        {
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Data source with this ID already exists.");
        }

        var secretId = IsDefaultValue(request.ConnectionString)
            ? DataSourceSecretResolver.DefaultSentinel
            : await SetSecretAsync(tenantId, request.ConnectionString);

        var root = new DataServiceConfiguration
        {
            ItemId = tenantId,
            // A blank id gets a new GUID, exactly as today's InjectDefaultValue does.
            ConfigItemId = string.IsNullOrWhiteSpace(request.ItemId) ? Guid.NewGuid().ToString() : request.ItemId,
            DbConnectionString = null,
            DbConnectionSecretId = secretId,
            DatabaseName = request.DatabaseName,
            ValueChangedAfterDeploy = true
        };
        root.InjectDefaultValue();
        root.OrganizationId = BlocksContext.GetContext()?.OrganizationId ?? root.OrganizationId;
        root.AnalyticsConfiguration = new AnalyticsConfiguration
        {
            EnableAnalytics = true,
            EnableDate = root.CreatedDate,
            ValidTill = root.CreatedDate.AddDays(14)
        };

        // A failed insert (e.g. DuplicateKey of a parallel create) is today's error; the new secret stays unused.
        await _repository.InsertAsync(root, GraphQlConstant.BlocksRootDbName);
        await CacheDataSourceAsync(request.ProjectKey, secretId, root.DatabaseName);

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { ItemId = root.ConfigItemId });
    }

    #endregion

    #region Update

    /// <summary>Secret action of an Update (same table as os SPEC2 §6.5 step 2).</summary>
    public enum SecretAction { None, Rotate, Set, ToDefault }

    public async Task<ServiceResponse<ActionResponse>> UpdateConfiguration(UpdateDataGatewayConfigurationRequest request)
    {
        var validationResult = await _requestValidator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var tenantId = TenantContext.GetTenantId();
        var root = await GetRootDocAsync(tenantId);
        if (root is null)
            return RefuseNotMigrated(tenantId);

        if (!string.Equals(root.ConfigItemId, request.ItemId, StringComparison.Ordinal))
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Data source not found.")
                .SetHttpStatusCode(404);

        var oldSecretId = root.DbConnectionSecretId;
        var (action, _) = await DecideSecretActionAsync(tenantId, request.ConnectionString, oldSecretId);

        // Flag FIRST (before any secret write): a later failure can never leave a changed value unflagged.
        if (action != SecretAction.None)
        {
            var flagged = await _repository.FindOneAndUpdateAsync(
                CollectionName,
                RootFilter(tenantId),
                new BsonDocument("$set", new BsonDocument(nameof(DataServiceConfiguration.ValueChangedAfterDeploy), true)),
                isUpsert: false,
                GraphQlConstant.BlocksRootDbName);
            if (flagged is null)
                return RefuseNotMigrated(tenantId);
        }

        var newSecretId = oldSecretId;
        switch (action)
        {
            case SecretAction.Rotate:
                await _secretResolver.ExecuteAsync(tenantId, async s =>
                {
                    await s.RotateAsync(oldSecretId!, new RotateSecretRequest { Value = request.ConnectionString });
                    return true;
                });
                break;
            case SecretAction.Set:
                newSecretId = await SetSecretAsync(tenantId, request.ConnectionString);
                break;
            case SecretAction.ToDefault:
                newSecretId = DataSourceSecretResolver.DefaultSentinel;
                break;
        }

        ApplyRequest(root, request);
        root.LastUpdatedDate = DateTime.UtcNow;
        root.LastUpdatedBy = BlocksContext.GetContext()?.UserId ?? root.LastUpdatedBy;
        root.DbConnectionSecretId = newSecretId;

        // Root: field $set (never a whole-doc replace: keeps MigratedFrom and every unknown field).
        var rootSet = new BsonDocument
        {
            { nameof(DataServiceConfiguration.DatabaseName), root.DatabaseName },
            { nameof(DataServiceConfiguration.IsCollectionNameEditable), root.IsCollectionNameEditable },
            { nameof(DataServiceConfiguration.CollectionNamePattern), root.CollectionNamePattern },
            { nameof(DataServiceConfiguration.LastUpdatedDate), root.LastUpdatedDate },
            { nameof(DataServiceConfiguration.LastUpdatedBy), Str(root.LastUpdatedBy) },
        };
        var rootUnset = new BsonDocument();
        AddOrUnset(rootSet, rootUnset, nameof(DataServiceConfiguration.DbConnectionSecretId), newSecretId is null ? null : new BsonString(newSecretId));
        AddOrUnset(rootSet, rootUnset, nameof(DataServiceConfiguration.AnalyticsConfiguration), AnalyticsToBson(root.AnalyticsConfiguration));
        var rootUpdate = new BsonDocument("$set", rootSet);
        if (rootUnset.ElementCount > 0)
            rootUpdate.Add("$unset", rootUnset);
        var updatedRoot = await _repository.FindOneAndUpdateAsync(
            CollectionName, RootFilter(tenantId), rootUpdate, isUpsert: false, GraphQlConstant.BlocksRootDbName);

        // Tenant copy while it exists: non-secret fields only, no upsert, never DbConnectionString.
        var copySet = BuildTenantCopySet(root);
        await _repository.UpdateAsync(
            CollectionName,
            new BsonDocument("_id", root.ConfigItemId),
            copySet);

        await CacheDataSourceAsync(request.ProjectKey, newSecretId, root.DatabaseName);

        // A switch to "default" leaves the old secret as it is (owner 2026-10-13 "keep": unused secrets are archived by hand).

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse
        {
            Acknowledged = true,
            TotalImpactedData = updatedRoot is null ? 0 : 1
        });
    }

    /// <summary>
    /// Reads only. custom + active id: compare (equal → none, differs or value missing → rotate);
    /// custom + locked → rotate; custom + deleted/not found → set; custom + null/"default" → set;
    /// "default" + "default" → none; "default" + anything else → to-default.
    /// </summary>
    internal async Task<(SecretAction Action, bool OldSecretActiveOrLocked)> DecideSecretActionAsync(
        string tenantId, string newValue, string? rootSecretId)
    {
        if (IsDefaultValue(newValue))
        {
            if (DataSourceSecretResolver.IsDefault(rootSecretId))
                return (SecretAction.None, false);
            // No secret call: the old secret is kept as it is (owner 2026-10-13 "keep").
            return (SecretAction.ToDefault, false);
        }

        if (DataSourceSecretResolver.IsSentinel(rootSecretId))
            return (SecretAction.Set, false);

        var metadata = await _secretResolver.ExecuteAsync(tenantId, s => s.GetAsync(rootSecretId!));
        if (metadata is null || metadata.Status == SecretStatuses.Deleted)
            return (SecretAction.Set, false);
        if (metadata.Status == SecretStatuses.Locked)
            return (SecretAction.Rotate, true);

        try
        {
            var current = await _secretResolver.ResolveAsync(tenantId, rootSecretId);
            return (string.Equals(current, newValue, StringComparison.Ordinal) ? SecretAction.None : SecretAction.Rotate, true);
        }
        catch (DataSourceUnavailableException ex) when (ex.SecretError is SecretNotFoundException)
        {
            // Active, but the vault value is gone: rotate writes it again (no compare possible).
            return (SecretAction.Rotate, true);
        }
    }

    private ServiceResponse<ActionResponse> RefuseNotMigrated(string tenantId)
    {
        _logger.LogWarning("[dsc] update-refused-not-migrated tenant={TenantId}", tenantId);
        return new ServiceResponse<ActionResponse>()
            .SetErrorMessage(NotMigratedMessage)
            .SetHttpStatusCode(409);
    }

    private static void ApplyRequest(DataServiceConfiguration doc, UpdateDataGatewayConfigurationRequest request)
    {
        doc.DatabaseName = request.DatabaseName;
        doc.IsCollectionNameEditable = request.IsCollectionNameEditable;
        doc.CollectionNamePattern = request.CollectionNamePattern;
        if (request.EnableAnalytics.HasValue)
        {
            doc.AnalyticsConfiguration ??= new AnalyticsConfiguration();
            if (request.EnableAnalytics.Value
                && !doc.AnalyticsConfiguration.EnableDate.HasValue
                && !doc.AnalyticsConfiguration.ValidTill.HasValue)
            {
                var enableDate = DateTime.UtcNow;
                doc.AnalyticsConfiguration.EnableDate = enableDate;
                doc.AnalyticsConfiguration.ValidTill = enableDate.AddDays(14);
            }

            doc.AnalyticsConfiguration.EnableAnalytics = request.EnableAnalytics.Value;
        }
    }

    /// <summary>The $set of a tenant-copy write: non-secret fields only (never DbConnectionString).</summary>
    internal static BsonDocument BuildTenantCopySet(DataServiceConfiguration root) => new()
    {
        { nameof(DataServiceConfiguration.DatabaseName), root.DatabaseName },
        { nameof(DataServiceConfiguration.IsCollectionNameEditable), root.IsCollectionNameEditable },
        { nameof(DataServiceConfiguration.CollectionNamePattern), root.CollectionNamePattern },
        { nameof(DataServiceConfiguration.AnalyticsConfiguration), AnalyticsToBson(root.AnalyticsConfiguration) ?? BsonNull.Value },
        { nameof(DataServiceConfiguration.LastUpdatedDate), root.LastUpdatedDate },
        { nameof(DataServiceConfiguration.LastUpdatedBy), Str(root.LastUpdatedBy) },
    };

    private static BsonValue Str(string? value) => value is null ? BsonNull.Value : new BsonString(value);

    private static BsonValue? AnalyticsToBson(AnalyticsConfiguration? analytics) =>
        analytics is null ? null : analytics.ToBsonDocument();

    private static void AddOrUnset(BsonDocument set, BsonDocument unset, string field, BsonValue? value)
    {
        if (value is null || value.IsBsonNull)
            unset.Add(field, "");
        else
            set.Add(field, value);
    }

    #endregion

    #region Analytics

    public async Task<bool> CanAccessAnalyticsAsync()
    {
        // The caller's own root doc (never "the first live doc" of the root DB), else the tenant copy.
        var dataServiceConfiguration = await GetRootDocAsync(TenantContext.GetTenantId())
            ?? await GetTenantCopyAsync();

        return dataServiceConfiguration?.AnalyticsConfiguration?.IsAccessibleAt(DateTime.UtcNow) == true;
    }

    #endregion

    #region Helpers

    private static bool IsDefaultValue(string value) =>
        DataSourceSecretResolver.IsDefault(value);

    private Task<string> SetSecretAsync(string tenantId, string value) =>
        _secretResolver.ExecuteAsync(tenantId, s => s.SetAsync(new SetSecretRequest
        {
            Name = SecretName,
            Type = SecretTypes.Service,
            Tags = [SecretTag],
            OrganizationId = "default",
            Value = value
        }));

    private static BsonDocument RootFilter(string tenantId) => new()
    {
        { "_id", tenantId },
        { nameof(DataServiceConfiguration.ConfigItemId), new BsonDocument("$exists", true) }
    };

    /// <summary>Root doc of the tenant: <c>_id = TenantId</c> with a <c>ConfigItemId</c> (a doc without one is not a root doc).</summary>
    private async Task<DataServiceConfiguration?> GetRootDocAsync(string tenantId, bool includeDeleted = false)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
            return null;
        var builder = Builders<DataServiceConfiguration>.Filter;
        var filter = builder.Eq(x => x.ItemId, tenantId) & builder.Exists(x => x.ConfigItemId);
        if (!includeDeleted)
            filter &= builder.Eq(x => x.IsDeleted, false);
        return await _repository.GetItemAsync(filter, GraphQlConstant.BlocksRootDbName);
    }

    /// <summary>
    /// Live tenant copy in the tenant DB (today's read). Docs with a <c>ConfigItemId</c> are root docs (the
    /// root tenant's tenant DB is the root DB) and are never taken for a tenant copy.
    /// </summary>
    private async Task<DataServiceConfiguration?> GetTenantCopyAsync()
    {
        var builder = Builders<DataServiceConfiguration>.Filter;
        var filter = builder.Eq(x => x.IsDeleted, false) & builder.Exists(x => x.ConfigItemId, false);
        return await _repository.GetItemAsync(filter);
    }

    /// <summary>
    /// Redis hash under <c>request.ProjectKey</c> (as today): KeyExists → RemoveKey → AddHash with
    /// <c>DbConnectionSecretId</c>, <c>DatabaseName</c>, <c>Version</c>. No value. RemoveKey also drops a legacy field.
    /// </summary>
    private async Task CacheDataSourceAsync(string projectKey, string? secretId, string databaseName)
    {
        var blocksCtx = BlocksContext.GetContext();
        if (blocksCtx is null)
            return;

        if (await _cacheClient.KeyExistsAsync(projectKey))
            await _cacheClient.RemoveKeyAsync(projectKey);

        await _cacheClient.AddHashValueAsync(projectKey, [
            new HashEntry(GqlDbRepository.HashFieldSecretId, secretId ?? string.Empty),
            new HashEntry(GqlDbRepository.HashFieldDatabaseName, databaseName),
            new HashEntry(GqlDbRepository.HashFieldVersion, DateTime.UtcNow.Ticks)
        ]);
    }

    #endregion
}
