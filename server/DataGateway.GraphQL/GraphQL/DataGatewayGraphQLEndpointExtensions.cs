using System.Diagnostics;
using System.Globalization;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Routing for the multi-tenant data gateway. Every request goes to the same base path
/// (e.g. <c>/api/gateway</c>) and the tenant is resolved per request: from the access token when the
/// request is authenticated, otherwise from the <c>x-blocks-key</c> request header. The tenant id
/// selects the GraphQL schema/executor, so different tenants can expose identically named schemas in
/// complete isolation.
///
/// IMPORTANT: this must be mapped after authentication middleware so the token is available.
/// </summary>
public static class DataGatewayGraphQLEndpointExtensions
{
    public static IEndpointConventionBuilder MapDataGatewayGraphQL(this WebApplication app, string basePath)
    {
        return app.Map(basePath, HandleDataGatewayRequestAsync);
    }

    internal static async Task HandleDataGatewayRequestAsync(HttpContext context)
    {
        try
        {
            // First, so every response of this endpoint carries them: the early rejections below and
            // whatever the GraphQL pipeline writes. REST lives in a controller and never passes through here.
            // Inside the try, so a failure reading the options is logged like any other.
            AddDeprecationHeaders(context);
            await DispatchAsync(context);
        }
        catch (Exception ex)
        {
            // The GraphQL pipeline listener classifies anything that fails inside execution; this
            // catches what fails outside it (tenant dispatch, transport) so no /gateway request goes
            // unlogged. MarkFailed keeps whatever more specific reason was already recorded.
            var gatewayOperation = GatewayOperationActivity.MarkFailed(
                Activity.Current, GatewayFailureKind.Unhandled, ex.Message);
            GatewayOperationActivity.Tag(Activity.Current, gatewayOperation);
            throw;
        }
    }

    private static async Task DispatchAsync(HttpContext context)
    {
        var isAuthenticated = await GatewayCallerResolver.AuthenticateAsync(context);

        // Only an anonymous caller can be refused introspection, so only their request is read.
        if (!isAuthenticated
            && await GraphQLIntrospectionHelper.ContainsIntrospectionQueryAsync(context.Request, context.RequestAborted))
        {
            const string message = "you are not authorized to introspect the schema";
            LogRejected(GatewayFailureKind.Authentication, message, "introspection", isIntrospection: true);

            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new
            {
                error = message
            });
            return;
        }

        // Token first (authenticated requests), then the x-blocks-key header.
        var tenantId = GatewayCallerResolver.ResolveTenantId();
        if (tenantId is null)
        {
            var message = $"Unable to resolve tenant. Provide a valid bearer token or the '{GraphQlConstant.BlocksKeyHeaderKey}' header.";
            LogRejected(GatewayFailureKind.Authentication, message);

            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new
            {
                error = message
            });
            return;
        }

        // Pin the resolved tenant for the rest of the request (schema build + data access).
        RequestContextAccessor.Current.TenantId = tenantId;

        // Catch up with a publish handled by another pod. Never blocks on a rebuild: this request
        // is served by the current executor while a newer one is built in the background.
        var versionTracker = context.RequestServices.GetRequiredService<SchemaVersionTracker>();
        await versionTracker.EnsureCurrentAsync(tenantId, context.RequestAborted);

        var dispatcher = context.RequestServices.GetRequiredService<DataGatewayPipelineDispatcher>();
        var pipeline = dispatcher.GetPipeline(tenantId);
        await pipeline(context);
    }

    /// <summary>
    /// Announces the GraphQL deprecation on the response, when configured: <c>Deprecation</c> (RFC 9745), plus
    /// <c>Link</c> to the migration guide and <c>Sunset</c> (RFC 8594) when those are set. Added when the response
    /// starts, so it covers responses the GraphQL pipeline writes as well.
    /// </summary>
    private static void AddDeprecationHeaders(HttpContext context)
    {
        var options = context.RequestServices.GetService<IOptions<GraphQLDeprecationOptions>>()?.Value;
        if (options?.DeprecatedSince is not { } deprecatedSince)
        {
            return;
        }

        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers["Deprecation"] = $"@{deprecatedSince.ToUnixTimeSeconds()}";
            if (!string.IsNullOrWhiteSpace(options.MigrationGuideUrl))
            {
                headers["Link"] = $"<{options.MigrationGuideUrl}>; rel=\"deprecation\"";
            }

            if (options.SunsetDate is { } sunset)
            {
                headers["Sunset"] = sunset.UtcDateTime.ToString("r", CultureInfo.InvariantCulture);
            }

            return Task.CompletedTask;
        });
    }

    /// <summary>
    /// Logs a request rejected here, before the GraphQL pipeline runs — the pipeline listener that
    /// normally writes the log never gets to see these, so they would otherwise be missing from the
    /// request history entirely.
    /// </summary>
    private static void LogRejected(
        string failureKind,
        string message,
        string? operationType = null,
        bool isIntrospection = false)
    {
        var gatewayOperation = GatewayOperationActivity.MarkFailed(
            Activity.Current, failureKind, message);
        gatewayOperation.OperationType ??= operationType;
        gatewayOperation.IsIntrospection = isIntrospection;

        GatewayOperationActivity.Tag(Activity.Current, gatewayOperation);
    }
}
