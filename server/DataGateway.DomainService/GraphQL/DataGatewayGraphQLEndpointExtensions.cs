using System.Diagnostics;
using System.Security.Claims;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

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

    private static async Task HandleDataGatewayRequestAsync(HttpContext context)
    {
        try
        {
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
        bool isAuthenticated = false;
        var blocksKey = RequestContextAccessor.Current.BlocksKey;
        if (!string.IsNullOrWhiteSpace(blocksKey))
        {
            var authenticator = context.RequestServices.GetRequiredService<DataGatewayTokenAuthenticator>();
            var principal = await authenticator.GetPrincipalFromTokenAsync(context.Request, blocksKey);
            if (principal is not null)
            {
                context.User = principal;
                isAuthenticated = true;
            }
        }

        if (await GraphQLIntrospectionHelper.ContainsIntrospectionQueryAsync(context.Request, context.RequestAborted)
            && !isAuthenticated)
        {
            const string message = "you are not authorized to introspect the schema";
            LogRejected(GatewayFailureKind.Authentication, message, "introspection");

            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new
            {
                error = message
            });
            return;
        }

        // Token first (authenticated requests), then the x-blocks-key header.
        var tenantId = TenantContext.GetTenantId();
        if (string.IsNullOrWhiteSpace(tenantId))
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

        var dispatcher = context.RequestServices.GetRequiredService<DataGatewayPipelineDispatcher>();
        var pipeline = dispatcher.GetPipeline(tenantId);
        await pipeline(context);
    }

    /// <summary>
    /// Logs a request rejected here, before the GraphQL pipeline runs — the pipeline listener that
    /// normally writes the log never gets to see these, so they would otherwise be missing from the
    /// request history entirely.
    /// </summary>
    private static void LogRejected(string failureKind, string message, string? operationType = null)
    {
        var gatewayOperation = GatewayOperationActivity.MarkFailed(
            Activity.Current, failureKind, message);
        gatewayOperation.OperationType ??= operationType;

        GatewayOperationActivity.Tag(Activity.Current, gatewayOperation);
    }
}
