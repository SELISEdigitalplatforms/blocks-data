using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Builds and caches a dedicated HotChocolate HTTP pipeline per tenant.
///
/// HotChocolate's <c>MapGraphQL</c> binds an endpoint to a single, fixed schema name and does not
/// support dynamic routes. To serve many tenants from one instance we build the standard
/// HotChocolate middleware chain (POST/GET/WebSocket/SDL/tooling) for each tenant id on demand
/// and reuse it for subsequent requests.
///
/// Schema reload uses version-stamped schema names (e.g. <c>tenantId@v1</c>) so that after each
/// reload HC has no cache entry for the new name and is forced to build a fresh executor.
/// This avoids relying on <c>EvictRequestExecutor</c> being reliable for dynamically-created schemas.
/// </summary>
public sealed class DataGatewayPipelineDispatcher
{
    private readonly IServiceProvider _applicationServices;
    private readonly ConcurrentDictionary<string, RequestDelegate> _pipelines = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, int> _reloadCounts = new(StringComparer.Ordinal);

    public DataGatewayPipelineDispatcher(IServiceProvider applicationServices)
    {
        _applicationServices = applicationServices;
    }

    public RequestDelegate GetPipeline(string tenantId)
    {
        var count = _reloadCounts.GetOrAdd(tenantId, 0);
        var schemaName = count == 0 ? tenantId : $"{tenantId}__v{count}";
        return _pipelines.GetOrAdd(schemaName, BuildPipeline);
    }

    /// <summary>
    /// Increments the reload version for <paramref name="tenantId"/>, removes the old pipeline
    /// from cache, and returns the old schema name so the caller can evict the HC executor.
    /// </summary>
    public string BumpVersionAndClearPipeline(string tenantId)
    {
        int newCount = _reloadCounts.AddOrUpdate(tenantId, 1, (_, v) => v + 1);
        int oldCount = newCount - 1;
        var oldSchemaName = oldCount == 0 ? tenantId : $"{tenantId}__v{oldCount}";
        _pipelines.TryRemove(oldSchemaName, out _);
        return oldSchemaName;
    }

    private RequestDelegate BuildPipeline(string schemaName)
    {
        var appBuilder = new ApplicationBuilder(_applicationServices);
        appBuilder.MapGraphQL(PathString.Empty, schemaName);
        return appBuilder.Build();
    }
}
