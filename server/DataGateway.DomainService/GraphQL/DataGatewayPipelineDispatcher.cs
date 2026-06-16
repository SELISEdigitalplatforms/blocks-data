using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Builds and caches a dedicated HotChocolate HTTP pipeline per tenant (schema name == tenant id).
///
/// HotChocolate's <c>MapGraphQL</c> binds an endpoint to a single, fixed schema name and does not
/// support dynamic routes. To serve many tenants from one instance we build the standard
/// HotChocolate middleware chain (POST/GET/WebSocket/SDL/tooling) for each tenant id on demand
/// and reuse it for subsequent requests. The middleware chain resolves its executor by the tenant
/// id, and our <see cref="ProjectExecutorOptionsMonitor"/> makes that executor resolvable for any
/// id. Executor eviction (schema reload) is handled internally by HotChocolate's
/// <c>RequestExecutorProxy</c>, so cached pipelines automatically pick up rebuilt schemas.
/// </summary>
public sealed class DataGatewayPipelineDispatcher
{
    private readonly IServiceProvider _applicationServices;
    private readonly ConcurrentDictionary<string, RequestDelegate> _pipelines = new(StringComparer.Ordinal);

    public DataGatewayPipelineDispatcher(IServiceProvider applicationServices)
    {
        _applicationServices = applicationServices;
    }

    public RequestDelegate GetPipeline(string schemaName)
        => _pipelines.GetOrAdd(schemaName, BuildPipeline);

    private RequestDelegate BuildPipeline(string schemaName)
    {
        var appBuilder = new ApplicationBuilder(_applicationServices);
        // Reuse HotChocolate's own HTTP middleware chain, bound to this project's schema name.
        appBuilder.MapGraphQL(PathString.Empty, schemaName);
        return appBuilder.Build();
    }
}
