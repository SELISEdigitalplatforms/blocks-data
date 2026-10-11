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
/// The schema name is the tenant id and never changes. A schema reload evicts the tenant's executor
/// (<see cref="SchemaVersionTracker"/>); HotChocolate rebuilds it under the same name and the
/// cached pipeline picks up the new executor, so the pipeline itself is never rebuilt.
/// </summary>
public sealed class DataGatewayPipelineDispatcher
{
    private readonly IServiceProvider _applicationServices;
    private readonly ConcurrentDictionary<string, RequestDelegate> _pipelines = new(StringComparer.Ordinal);

    public DataGatewayPipelineDispatcher(IServiceProvider applicationServices)
    {
        _applicationServices = applicationServices;
    }

    public RequestDelegate GetPipeline(string tenantId) => _pipelines.GetOrAdd(tenantId, BuildPipeline);

    private RequestDelegate BuildPipeline(string schemaName)
    {
        var appBuilder = new ApplicationBuilder(_applicationServices);
        appBuilder.MapGraphQL(PathString.Empty, schemaName);
        return appBuilder.Build();
    }
}
