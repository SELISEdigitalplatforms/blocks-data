using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Resolvers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace DataGateway.DomainService.Middlewares;

internal static class SchemaAccessMiddlewareHelper
{
    public static async Task InvokeAsync(
        IMiddlewareContext context,
        FieldDelegate next,
        SchemaAccessLevel accessLevel,
        string middlewareName)
    {
        Console.WriteLine($"Invoking {middlewareName}");
        Console.WriteLine($"{middlewareName}: accessLevel: {accessLevel}");
        var httpContextAccessor = context.Services.GetService<IHttpContextAccessor>();
        var httpContext = httpContextAccessor?.HttpContext;
        if (!IsValidTenant(httpContext))
        {
            Console.WriteLine($"{middlewareName}: tenant is not valid");
            throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("Tenant is not valid.")
                    .SetCode(GraphQlConstant.UnauthorizedErrorCode)
                    .Build());
        }

        if (accessLevel == SchemaAccessLevel.Public)
        {
            await next(context);
            return;
        }

        Console.WriteLine($"{middlewareName}: accessLevel is not public");
        var isAuthenticated = IsAuthenticated(httpContext);
        Console.WriteLine($"{middlewareName}: isAuthenticated: {isAuthenticated}");

        if (!isAuthenticated)
        {
            Console.WriteLine($"{middlewareName}: user is not authenticated");
            throw new GraphQLException(
                ErrorBuilder.New()
                    .SetMessage("User is not authenticated.")
                    .SetCode(GraphQlConstant.UnauthorizedErrorCode)
                    .Build());
        }

        await next(context);
    }

    private static bool IsValidTenant(HttpContext? httpContext)
    {
        // if x-blocks-key from header matches with constant tenantid or is a blocks cloud tenant then it's a valid tenant
        var blocksKey = httpContext?.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(blocksKey))
            return false;

        return blocksKey == GraphQlConstant.TenantId || RequestContextAccessor.Current.IsRequestFromBlocksCloud;
    }


    private static bool IsAuthenticated(HttpContext? httpContext)
    {
        if (httpContext is null)
            return false;

        var hasAuthorizationHeader = !string.IsNullOrWhiteSpace(httpContext.Request.Headers.Authorization);
        var hasAuthCookie = HasAuthCookie(httpContext);
        var isUserAuthenticated = httpContext.User?.Identity?.IsAuthenticated ?? false;

        return (hasAuthorizationHeader || hasAuthCookie) && isUserAuthenticated;
    }

    private static bool HasAuthCookie(HttpContext httpContext)
    {
        var requestCookies = httpContext.Request.Cookies;

        // Cookie key is always access_token_{x-blocks-key}
        var blocksKey = httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(blocksKey))
        {
            var accessTokenCookieKey = $"access_token_{blocksKey}";
            if (!string.IsNullOrWhiteSpace(accessTokenCookieKey) && requestCookies.Keys.Contains(accessTokenCookieKey))
                return true;
        }
        return false;
    }
}
