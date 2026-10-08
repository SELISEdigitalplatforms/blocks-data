using DataGateway.DomainService.Services;
using HotChocolate;
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

        // Snapshots never change, so the version read here and its content always match. A publish
        // landing after this read is picked up by the next check.
        var version = await _versionStore.GetAsync(schemaName, cancellationToken);
        var source = version > 0 ? await _snapshotStore.LoadAsync(schemaName, version, cancellationToken) : null;
        if (source is null)
        {
            // A tenant from before published snapshots: serve what it served before, its drafts,
            // as its first published version.
            (version, source) = await _publishService.BootstrapAsync(schemaName, cancellationToken);
        }

        _builtVersions.BeginBuild(schemaName, version);
        _logger.LogInformation("Building GraphQL schema for tenant {TenantId} from published version {Version}", schemaName, version);
        _schemaBuilder.BuildSchema(schemaName, source, schemaBuilder);
    }

    public void OnExecutorCreated(string schemaName)
    {
        if (IsNotATenant(schemaName))
        {
            return;
        }

        _builtVersions.CompleteBuild(schemaName);
    }

    private static bool IsNotATenant(string schemaName) =>
        string.IsNullOrWhiteSpace(schemaName) || schemaName == Schema.DefaultName;
}
