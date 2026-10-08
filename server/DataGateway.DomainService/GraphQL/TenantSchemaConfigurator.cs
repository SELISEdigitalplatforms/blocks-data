using System.Diagnostics;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Services;
using HotChocolate;
using HotChocolate.Configuration;
using HotChocolate.Types.Descriptors;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Builds a tenant's GraphQL schema for the executor named after that tenant.
/// </summary>
public interface ITenantSchemaConfigurator
{
    ValueTask ConfigureAsync(string schemaName, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken);

    void OnExecutorCreated(string schemaName);
}

/// <summary>
/// Builds a tenant's schema from its live published snapshot, never from the drafts being edited,
/// so every pod (including new and restarted ones) serves exactly what was published.
///
/// The tenant is the executor's schema name, so the schema can be built without an HTTP request.
/// That matters because HotChocolate rebuilds an evicted executor on a background task, where
/// there is no request context; reading the tenant from the request made those rebuilds silently
/// fail.
/// </summary>
public sealed class TenantSchemaConfigurator : ITenantSchemaConfigurator
{
    private readonly GraphqlSchemaBuilder _schemaBuilder;
    private readonly ISchemaVersionStore _versionStore;
    private readonly ISchemaSnapshotStore _snapshotStore;
    private readonly ISchemaPublishService _publishService;
    private readonly BuiltSchemaVersions _builtVersions;
    private readonly ILogger<TenantSchemaConfigurator> _logger;

    public TenantSchemaConfigurator(
        GraphqlSchemaBuilder schemaBuilder,
        ISchemaVersionStore versionStore,
        ISchemaSnapshotStore snapshotStore,
        ISchemaPublishService publishService,
        BuiltSchemaVersions builtVersions,
        ILogger<TenantSchemaConfigurator> logger)
    {
        _schemaBuilder = schemaBuilder ?? throw new ArgumentNullException(nameof(schemaBuilder));
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
        _snapshotStore = snapshotStore ?? throw new ArgumentNullException(nameof(snapshotStore));
        _publishService = publishService ?? throw new ArgumentNullException(nameof(publishService));
        _builtVersions = builtVersions ?? throw new ArgumentNullException(nameof(builtVersions));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async ValueTask ConfigureAsync(string schemaName, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        if (IsNotATenant(schemaName))
        {
            return;
        }

        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Rebuild, schemaName);
        long? version = null;
        try
        {
            var started = Stopwatch.GetTimestamp();

            // Snapshots never change, so the version read here and its content always match. A
            // publish landing after this read is picked up by the next check.
            version = await _versionStore.GetAsync(schemaName, cancellationToken);
            var source = version > 0 ? await _snapshotStore.LoadAsync(schemaName, version.Value, cancellationToken) : null;
            if (source is null)
            {
                // A tenant from before published snapshots: serve what it served before, its
                // drafts, as its first published version.
                _logger.LogInformation("Tenant {TenantId} has no stored schema snapshot for version {Version}; creating its first published version from its drafts",
                    schemaName, version);
                (var bootstrapped, source) = await _publishService.BootstrapAsync(schemaName, cancellationToken);
                version = bootstrapped;
            }

            _builtVersions.BeginBuild(schemaName, version.Value);
            _logger.LogInformation("Building GraphQL schema for tenant {TenantId} from published version {Version}: {SchemaCount} schemas, loaded in {LoadMs} ms",
                schemaName, version, source.SchemaDefinitions.Count, SchemaLog.ElapsedMs(started));

            // HotChocolate validates the types after this hook returns and discards the error when
            // the build runs in the background, so it is logged from inside the build.
            var builtVersion = version.Value;
            schemaBuilder.TryAddTypeInterceptor(new BuildErrorInterceptor(error => LogBuildFailure(schemaName, builtVersion, error)));

            _schemaBuilder.BuildSchema(schemaName, source, schemaBuilder);
        }
        catch (Exception ex)
        {
            // HotChocolate discards this on background rebuilds; without this log a pod that cannot
            // rebuild would silently stay on its old version.
            LogBuildFailure(schemaName, version, ex);
            throw;
        }
    }

    public void OnExecutorCreated(string schemaName)
    {
        if (IsNotATenant(schemaName))
        {
            return;
        }

        if (_builtVersions.CompleteBuild(schemaName) is not { } build)
        {
            return;
        }

        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Rebuild, schemaName, build.Version);
        var elapsedMs = (long)build.Elapsed.TotalMilliseconds;
        if (build.PreviousVersion is { } previous)
        {
            _logger.LogInformation("Tenant {TenantId} switched from published version {PreviousVersion} to {Version} on this pod (rebuilt in {ElapsedMs} ms)",
                schemaName, previous, build.Version, elapsedMs);
        }
        else
        {
            _logger.LogInformation("Tenant {TenantId} is served from published version {Version} on this pod (built in {ElapsedMs} ms)",
                schemaName, build.Version, elapsedMs);
        }
    }

    private void LogBuildFailure(string tenantId, long? version, Exception error)
    {
        if (_builtVersions.TryGetBuilt(tenantId, out var servingVersion))
        {
            _logger.LogError(error, "Could not build the GraphQL schema for tenant {TenantId} from published version {Version}; this pod keeps serving version {ServingVersion} and retries later",
                tenantId, version, servingVersion);
        }
        else
        {
            _logger.LogError(error, "Could not build the GraphQL schema for tenant {TenantId} from published version {Version}; its GraphQL requests fail on this pod until a build succeeds",
                tenantId, version);
        }
    }

    private static bool IsNotATenant(string schemaName) =>
        string.IsNullOrWhiteSpace(schemaName) || schemaName == Schema.DefaultName;

    /// <summary>Reports the error when HotChocolate fails to create the schema from the built types.</summary>
    private sealed class BuildErrorInterceptor(Action<Exception> onError) : TypeInterceptor
    {
        public override void OnCreateSchemaError(IDescriptorContext context, Exception error) => onError(error);
    }
}
