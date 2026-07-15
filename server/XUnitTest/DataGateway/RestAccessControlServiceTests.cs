using System.Security.Claims;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

[Collection("ContextSerial")]
public class RestAccessControlServiceTests
{
    private static HttpContext BuildContext(
        bool withBlocksKey = true,
        bool withAuthHeader = false,
        bool authenticated = false)
    {
        var ctx = new DefaultHttpContext();
        if (withBlocksKey)
            ctx.Request.Headers["x-blocks-key"] = "some-tenant-key";
        if (withAuthHeader)
            ctx.Request.Headers.Authorization = "Bearer token";
        if (authenticated)
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity(authenticationType: "test"));
        else
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity());
        return ctx;
    }

    [Fact]
    public void EnsureAccess_MissingBlocksKey_ThrowsTenantInvalid()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var svc = new RestAccessControlService();
            var act = () => svc.EnsureAccess(BuildContext(withBlocksKey: false), SchemaAccessLevel.Public);
            act.Should().Throw<AccessDeniedException>().WithMessage("*Tenant*");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EnsureAccess_PublicWithValidTenant_Passes()
    {
        ClearContext();
        SetBlocksCloud(true); // bypass tenant-id equality via cloud flag
        try
        {
            var svc = new RestAccessControlService();
            var act = () => svc.EnsureAccess(BuildContext(), SchemaAccessLevel.Public);
            act.Should().NotThrow();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EnsureAccess_NonPublicUnauthenticated_Throws()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var svc = new RestAccessControlService();
            var act = () => svc.EnsureAccess(BuildContext(authenticated: false), SchemaAccessLevel.User);
            act.Should().Throw<AccessDeniedException>().WithMessage("*not authenticated*");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EnsureAccess_NonPublicAuthenticated_Passes()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var svc = new RestAccessControlService();
            var act = () => svc.EnsureAccess(BuildContext(withAuthHeader: true, authenticated: true), SchemaAccessLevel.User);
            act.Should().NotThrow();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void IsOwnerCheckRequired_AlwaysFalse()
    {
        var svc = new RestAccessControlService();
        svc.IsOwnerCheckRequired(Schema(), PolicyOperation.READ).Should().BeFalse();
    }
}
