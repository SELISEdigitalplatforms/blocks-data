using System.Diagnostics;
using Blocks.Genesis;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Resolvers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Middlewares;

internal static class SchemaAccessMiddlewareHelper
{
    public static async Task InvokeAsync(
        IMiddlewareContext context,
        FieldDelegate next,
        SchemaAccessLevel accessLevel,
        string middlewareName,
        string entityName)
    {
        // Runs before QueryService/MutationService ever gets invoked, so this is the only chance
        // to record what a request was for when access is denied here (tenant/auth checks below)
        // — those services never get a chance to set it themselves. CollectionName/MongoQuery
        // are left for QueryService/MutationService to set once execution actually reaches the
        // point of building a Mongo query.
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.SchemaName = context.Selection.Field.Name;
        gatewayOperation.EntityName = entityName;

        Console.WriteLine($"Invoking {middlewareName}");
        Console.WriteLine($"{middlewareName}: accessLevel: {accessLevel}");
        var httpContextAccessor = context.Services.GetService<IHttpContextAccessor>();
        var httpContext = httpContextAccessor?.HttpContext;
        var decision = SchemaAccessGate.Check(httpContext, accessLevel);
        if (decision == SchemaAccessDecision.InvalidTenant)
        {
            Console.WriteLine($"{middlewareName}: tenant is not valid");
            throw Rejected(GatewayFailureKind.Authentication, "Tenant is not valid.");
        }

        if (accessLevel == SchemaAccessLevel.Public)
        {
            await next(context);
            return;
        }

        Console.WriteLine($"{middlewareName}: accessLevel is not public");
        var isAuthenticated = decision == SchemaAccessDecision.Allowed;
        Console.WriteLine($"{middlewareName}: isAuthenticated: {isAuthenticated}");

        if (decision == SchemaAccessDecision.NotAuthenticated)
        {
            Console.WriteLine($"{middlewareName}: user is not authenticated");
            throw Rejected(GatewayFailureKind.Authentication, "User is not authenticated.");
        }

        await next(context);
    }

    /// <summary>
    /// Builds the GraphQL error for a rejected request and records why on the request log, so the
    /// log distinguishes "we don't know who you are" from the other ways a request can fail.
    /// </summary>
    private static GraphQLException Rejected(string failureKind, string message)
    {
        GatewayOperationActivity.MarkFailed(
            Activity.Current, failureKind, message, GraphQlConstant.UnauthorizedErrorCode);

        return new GraphQLException(
            ErrorBuilder.New()
                .SetMessage(message)
                .SetCode(GraphQlConstant.UnauthorizedErrorCode)
                .Build());
    }
}
