using System.Security.Claims;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models.Constants;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The tenant and authentication decision every schema field goes through, independent of GraphQL.
/// The field middlewares map each decision to their own error.
/// </summary>
[Collection("ContextSerial")]
public class SchemaAccessGateTests : IDisposable
{
    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private static DefaultHttpContext HttpContext(
        string? blocksKey = "tenant-1",
        string? authorization = null,
        bool authenticatedUser = false)
    {
        var httpContext = new DefaultHttpContext();
        if (blocksKey is not null)
        {
            httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey] = blocksKey;
        }

        if (authorization is not null)
        {
            httpContext.Request.Headers.Authorization = authorization;
        }

        if (authenticatedUser)
        {
            httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(authenticationType: "Test"));
        }

        return httpContext;
    }

    [Fact]
    public void NoBlocksKeyHeader_IsAnInvalidTenant()
    {
        SetContext(tenantId: "tenant-1");

        SchemaAccessGate.Check(HttpContext(blocksKey: null), SchemaAccessLevel.Public)
            .Should().Be(SchemaAccessDecision.InvalidTenant);
    }

    [Fact]
    public void NoHttpContext_IsAnInvalidTenant()
    {
        SetContext(tenantId: "tenant-1");

        SchemaAccessGate.Check(null, SchemaAccessLevel.Public)
            .Should().Be(SchemaAccessDecision.InvalidTenant);
    }

    [Fact]
    public void BlocksKeyThatIsNotTheTenant_AndNotBlocksCloud_IsAnInvalidTenant()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        SchemaAccessGate.Check(HttpContext(blocksKey: "other-tenant"), SchemaAccessLevel.Public)
            .Should().Be(SchemaAccessDecision.InvalidTenant);
    }

    [Fact]
    public void BlocksKeyThatIsNotTheTenant_FromBlocksCloud_IsAllowed()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(true);

        SchemaAccessGate.Check(HttpContext(blocksKey: "other-tenant"), SchemaAccessLevel.Public)
            .Should().Be(SchemaAccessDecision.Allowed);
    }

    [Fact]
    public void Public_WithAValidTenant_IsAllowedWithoutAUser()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        SchemaAccessGate.Check(HttpContext(), SchemaAccessLevel.Public)
            .Should().Be(SchemaAccessDecision.Allowed);
    }

    [Fact]
    public void Authenticated_WithNoAuthorizationHeaderAndNoUser_IsNotAuthenticated()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        // Without an Authorization header the x-blocks-key header still stands in for the auth
        // cookie, so it is the unauthenticated user that gets the caller refused.
        SchemaAccessGate.Check(HttpContext(), SchemaAccessLevel.User)
            .Should().Be(SchemaAccessDecision.NotAuthenticated);
    }

    [Fact]
    public void Authenticated_WithNoBlocksKey_IsAnInvalidTenantBeforeAuthenticationIsConsidered()
    {
        SetContext(tenantId: "tenant-1");

        SchemaAccessGate.Check(HttpContext(blocksKey: null, authorization: "Bearer abc", authenticatedUser: true), SchemaAccessLevel.User)
            .Should().Be(SchemaAccessDecision.InvalidTenant);
    }

    [Fact]
    public void Authenticated_WithAHeaderButAnUnauthenticatedUser_IsNotAuthenticated()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        SchemaAccessGate.Check(HttpContext(authorization: "Bearer abc"), SchemaAccessLevel.User)
            .Should().Be(SchemaAccessDecision.NotAuthenticated);
    }

    [Fact]
    public void Authenticated_WithAHeaderAndAnAuthenticatedUser_IsAllowed()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        SchemaAccessGate.Check(HttpContext(authorization: "Bearer abc", authenticatedUser: true), SchemaAccessLevel.User)
            .Should().Be(SchemaAccessDecision.Allowed);
    }

    [Fact]
    public void Authenticated_WithNoHeaderButAnAuthenticatedUser_IsAllowed()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);

        // HasAuthCookie is satisfied by the x-blocks-key header, so an authenticated user passes.
        SchemaAccessGate.Check(HttpContext(authenticatedUser: true), SchemaAccessLevel.User)
            .Should().Be(SchemaAccessDecision.Allowed);
    }
}
