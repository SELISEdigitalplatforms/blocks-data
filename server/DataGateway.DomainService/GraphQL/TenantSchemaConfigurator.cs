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
/// The tenant is the executor's schema name, so the schema can be built without an HTTP request.
/// That matters because HotChocolate rebuilds an evicted executor on a background task, where
/// there is no request context; reading the tenant from the request made those rebuilds silently
/// fail.
/// </summary>
public sealed class TenantSchemaConfigurator : ITenantSchemaConfigurator
{
    private readonly GraphqlSchemaBuilder _schemaBuilder;
    private readonly ISchemaVersionStore _versionStore;
    private readonly BuiltSchemaVersions _builtVersions;
    private readonly ILogger<TenantSchemaConfigurator> _logger;

    public TenantSchemaConfigurator(
        GraphqlSchemaBuilder schemaBuilder,
        ISchemaVersionStore versionStore,
        BuiltSchemaVersions builtVersions,
        ILogger<TenantSchemaConfigurator> logger)
    {
        _schemaBuilder = schemaBuilder ?? throw new ArgumentNullException(nameof(schemaBuilder));
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
        _builtVersions = builtVersions ?? throw new ArgumentNullException(nameof(builtVersions));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async ValueTask ConfigureAsync(string schemaName, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        if (IsNotATenant(schemaName))
        {
            return;
        }

        // Read the version before the definitions. If a publish lands in between, this build is
        // labelled with the older version and the next check simply rebuilds again; the reverse
        // order could label old definitions with the new version and never catch up.
        var version = await _versionStore.GetAsync(schemaName, cancellationToken);
        _builtVersions.BeginBuild(schemaName, version);

        _logger.LogInformation("Building GraphQL schema for tenant {TenantId} at version {Version}", schemaName, version);
        await _schemaBuilder.BuildSchema(schemaName, schemaBuilder, cancellationToken);
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
