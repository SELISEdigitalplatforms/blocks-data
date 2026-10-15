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

namespace DataGateway.DomainService.Services;

/// <summary>
/// Data-source configuration. The source of truth is the ROOT doc (<c>BlocksRootDb.DataServiceConfigurations</c>,
/// <c>_id = TenantId</c>). The connection string lives only in a Blocks <c>Service</c> secret named
/// <c>data-source</c> (value: plain text, <c>default</c> = Blocks DB). Save follows blocks-os
/// <c>CaptchaConfigService.SaveAsync</c>: <c>SetAsync</c> first, <c>RotateAsync</c> on the same id later, and a
/// new secret when the linked one is broken (archived or missing).
/// </summary>
public class DataGatewayConfigurationService : IDataGatewayConfigurationService
{
    public const string CollectionName = DataSourceConfigStore.CollectionName;
    public const string SecretName = DataSourceConfigStore.SecretName;
    public const string SecretTag = DataSourceConfigStore.SecretTag;

    private readonly IDbRepository _repository;
    private readonly IRequestValidator _requestValidator;
    private readonly IProjectService _projectService;
    private readonly IDataSourceSecretResolver _secretResolver;
    private readonly IDataSourceConfigStore _store;
    private readonly ILogger<DataGatewayConfigurationService> _logger;

    public DataGatewayConfigurationService(
        IDbRepository repository,
        IRequestValidator requestValidator,
        IProjectService projectService,
        IDataSourceSecretResolver secretResolver,
        IDataSourceConfigStore store,
        ILogger<DataGatewayConfigurationService>? logger = null)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _projectService = projectService ?? throw new ArgumentNullException(nameof(projectService));
        _secretResolver = secretResolver ?? throw new ArgumentNullException(nameof(secretResolver));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _logger = logger ?? NullLogger<DataGatewayConfigurationService>.Instance;
    }

    #region Get

    public async Task<ServiceResponse<DataGatewayConfigurationResponse>> GetConfiguration(string projectKey)
    {
        var tenantId = TenantContext.GetTenantId();
        var root = await _store.EnsureRootAsync(tenantId);
        var isCustom = await IsCustomAsync(tenantId, root.DbConnectionSecretId);

        var projectShortKey = await _projectService.GetTenantSlugAsync(projectKey);
        var response = new DataGatewayConfigurationResponse
        {
            ConnectionType = isCustom ? GqlDbRepository.ConnectionTypeCustom : GqlDbRepository.ConnectionTypeDefault,
            DatabaseName = root.DatabaseName,
            IsCollectionNameEditable = root.IsCollectionNameEditable,
            CollectionNamePattern = root.CollectionNamePattern,
            ProjectKey = projectKey,
            ProjectShortKey = projectShortKey,
            ItemId = root.ItemId,
            AnalyticsConfiguration = new AnalyticsConfigurationResponse
            {
                EnableAnalytics = root.AnalyticsConfiguration?.EnableAnalytics ?? false,
                EnableDate = root.AnalyticsConfiguration?.EnableDate,
                ValidTill = root.AnalyticsConfiguration?.ValidTill
            }
        };

        return new ServiceResponse<DataGatewayConfigurationResponse>().SetSuccess(response);
    }

    /// <summary>
    /// Whether the linked secret holds a real connection string. Only the kind leaves this method, never the value.
    /// A locked, archived, missing or empty secret answers <c>true</c> (custom): at runtime such a tenant fails closed,
    /// so it must not look like a Blocks DB tenant. A secret-store error fails the call.
    /// </summary>
    private async Task<bool> IsCustomAsync(string tenantId, string secretId)
    {
        if (string.IsNullOrEmpty(secretId))
            return true;

        var status = await SecretStatusAsync(tenantId, secretId, failOnError: true);
        if (status is not LinkedActive)
        {
            _logger.LogWarning("[dsc] get-secret-unusable tenant={TenantId} state={State}", tenantId, status);
            return true;
        }

        try
        {
            var value = await _secretResolver.ResolveAsync(tenantId, secretId);
            return !value.IsNullOrWhiteSpaceOrDefault();
        }
        catch (DataSourceUnavailableException ex) when (ex.SecretError is SecretNotFoundException)
        {
            _logger.LogWarning("[dsc] get-secret-unusable tenant={TenantId} state={State}", tenantId, "value-missing");
            return true;
        }
    }

    #endregion

    #region Save

    private const string LinkedActive = "active";
    private const string LinkedLocked = "locked";
    private const string LinkedArchived = "archived";
    private const string LinkedMissing = "missing";
    private const string LinkedUnavailable = "unavailable";

    /// <summary>POST: save with the values of the request (<c>ItemId</c> is ignored; the root doc is created if it is missing).</summary>
    public Task<ServiceResponse<ActionResponse>> InsertConfiguration(CreateDataGatewayConfigurationRequest request) =>
        SaveAsync(request, null);

    /// <summary>PUT: <c>ItemId</c> must be the root doc id (the TenantId).</summary>
    public Task<ServiceResponse<ActionResponse>> UpdateConfiguration(UpdateDataGatewayConfigurationRequest request) =>
        SaveAsync(request, request);

    private async Task<ServiceResponse<ActionResponse>> SaveAsync(
        CreateDataGatewayConfigurationRequest request, UpdateDataGatewayConfigurationRequest? update)
    {
        var validationResult = update is null
            ? await _requestValidator.ValidateAsync(request)
            : await _requestValidator.ValidateAsync(update);
        if (!validationResult.IsValid)
        {
            return new ServiceResponse<ActionResponse>().SetErrors(validationResult.Errors);
        }

        var tenantId = TenantContext.GetTenantId();
        var root = await _store.EnsureRootAsync(tenantId);

        if (update is not null && !string.Equals(root.ItemId, request.ItemId, StringComparison.Ordinal))
            return new ServiceResponse<ActionResponse>()
                .SetErrorMessage("Data source not found.")
                .SetHttpStatusCode(404);

        // null on PUT = keep the current data source; "" / "default" = Blocks DB; anything else = the real string.
        string? value = request.ConnectionString is null && update is not null
            ? null
            : DataSourceConnectionString.IsCustom(request.ConnectionString)
                ? request.ConnectionString!.Trim()
                : DataSourceSecretResolver.DefaultValue;

        var secretId = root.DbConnectionSecretId;
        string? repairedSecretId = null;
        if (value is not null)
        {
            var status = await SecretStatusAsync(tenantId, secretId, failOnError: false);
            if (string.IsNullOrEmpty(secretId) || status is LinkedArchived or LinkedMissing)
            {
                // A broken pointer cannot be rotated: new secret, same doc repointed at it (the old one is left as it is).
                var isRepair = !string.IsNullOrEmpty(secretId);
                secretId = await _store.SetSecretAsync(tenantId, value);
                repairedSecretId = isRepair ? secretId : null;
            }
            else
            {
                await _secretResolver.ExecuteAsync(tenantId, async s =>
                {
                    await s.RotateAsync(secretId, new RotateSecretRequest { Value = value });
                    return true;
                });
            }
        }

        var now = DateTime.UtcNow;
        now = new DateTime(DataSourceConfigStore.VersionOf(now), DateTimeKind.Utc);
        var databaseName = string.IsNullOrWhiteSpace(request.DatabaseName) ? root.DatabaseName : request.DatabaseName;
        var set = new BsonDocument
        {
            { nameof(DataServiceConfiguration.DbConnectionSecretId), secretId },
            { nameof(DataServiceConfiguration.DatabaseName), databaseName },
            { nameof(DataServiceConfiguration.LastUpdatedDate), now },
            { nameof(DataServiceConfiguration.LastUpdatedBy), Str(BlocksContext.GetContext()?.UserId ?? root.LastUpdatedBy) },
        };
        if (update is not null)
        {
            set[nameof(DataServiceConfiguration.IsCollectionNameEditable)] = update.IsCollectionNameEditable;
            if (!string.IsNullOrWhiteSpace(update.CollectionNamePattern))
                set[nameof(DataServiceConfiguration.CollectionNamePattern)] = update.CollectionNamePattern;
            var analytics = ApplyAnalytics(root.AnalyticsConfiguration, update);
            if (analytics is not null)
                set[nameof(DataServiceConfiguration.AnalyticsConfiguration)] = analytics.ToBsonDocument();
        }

        BsonDocument? saved;
        try
        {
            saved = await _repository.FindOneAndUpdateAsync(
                CollectionName,
                new BsonDocument { { "_id", tenantId }, { nameof(DataServiceConfiguration.IsDeleted), false } },
                new BsonDocument("$set", set),
                isUpsert: false,
                GraphQlConstant.BlocksRootDbName);
        }
        catch
        {
            await CompensateRepairAsync(tenantId, repairedSecretId);
            throw;
        }

        if (saved is null)
        {
            // Removed between the read above and this write.
            await CompensateRepairAsync(tenantId, repairedSecretId);
            return new ServiceResponse<ActionResponse>().SetErrorMessage("Data source not found.").SetHttpStatusCode(404);
        }

        var isCustom = value is not null
            ? !value.IsNullOrWhiteSpaceOrDefault()
            : await IsCustomAsync(tenantId, secretId);
        await _store.WriteHashAsync(request.ProjectKey, secretId, databaseName, isCustom, now);

        return new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse
        {
            Acknowledged = true,
            ItemId = tenantId,
            TotalImpactedData = 1
        });
    }

    /// <summary>Metadata read only (no value read). <c>unavailable</c> is not broken: an outage never forces a re-entry.</summary>
    private async Task<string> SecretStatusAsync(string tenantId, string secretId, bool failOnError)
    {
        if (string.IsNullOrEmpty(secretId))
            return LinkedMissing;
        try
        {
            var metadata = await _secretResolver.ExecuteAsync(tenantId, s => s.GetAsync(secretId));
            return metadata is null ? LinkedMissing
                : metadata.Status == SecretStatuses.Deleted ? LinkedArchived
                : metadata.Status == SecretStatuses.Locked ? LinkedLocked
                : LinkedActive;
        }
        catch (Exception ex) when (ex is not DataSourceUnavailableException)
        {
            _logger.LogWarning("[dsc] get-secret-failed tenant={TenantId} error={ErrorType}", tenantId, ex.GetType().Name);
            if (failOnError)
                throw new DataSourceUnavailableException(ex.Message, ex);
            return LinkedUnavailable;
        }
    }

    /// <summary>Retires the secret this save created for a broken pointer when the doc could not be repointed at it.</summary>
    private async Task CompensateRepairAsync(string tenantId, string? repairedSecretId)
    {
        if (!string.IsNullOrEmpty(repairedSecretId))
            await _store.DeleteOwnSecretAsync(tenantId, repairedSecretId);
    }

    /// <summary>The analytics doc after the request, or null when nothing changes.</summary>
    private static AnalyticsConfiguration? ApplyAnalytics(AnalyticsConfiguration? current, UpdateDataGatewayConfigurationRequest request)
    {
        if (!request.EnableAnalytics.HasValue)
            return null;

        var analytics = current ?? new AnalyticsConfiguration();
        if (request.EnableAnalytics.Value && !analytics.EnableDate.HasValue && !analytics.ValidTill.HasValue)
        {
            var enableDate = DateTime.UtcNow;
            analytics.EnableDate = enableDate;
            analytics.ValidTill = enableDate.AddDays(14);
        }

        analytics.EnableAnalytics = request.EnableAnalytics.Value;
        return analytics;
    }

    private static BsonValue Str(string? value) => value is null ? BsonNull.Value : new BsonString(value);

    #endregion

    #region Analytics

    public async Task<bool> CanAccessAnalyticsAsync()
    {
        // The caller's own root doc (read only: analytics never creates a doc).
        var root = await _store.GetRootAsync(TenantContext.GetTenantId());
        return root?.AnalyticsConfiguration?.IsAccessibleAt(DateTime.UtcNow) == true;
    }

    #endregion
}
