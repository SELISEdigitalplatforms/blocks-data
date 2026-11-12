using System.Security.Claims;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// Who is calling and which tenant they are calling for, resolved the same way whatever the
/// transport: the token (when the request carries a blocks key) first, then the tenant context.
/// </summary>
[Collection("ContextSerial")]
public class GatewayCallerResolverTests : IDisposable
{
    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private static Mock<DataGatewayTokenAuthenticator> Authenticator(ClaimsPrincipal? principal)
    {
        var authenticator = new Mock<DataGatewayTokenAuthenticator>(
            new Mock<ITenants>().Object,
            new Mock<ICacheClient>().Object,
            new Mock<IHttpClientFactory>().Object,
            new Mock<IDbRepository>().Object);
        authenticator
            .Setup(a => a.GetPrincipalFromTokenAsync(It.IsAny<HttpRequest>(), It.IsAny<string>()))
            .ReturnsAsync(principal);
        return authenticator;
    }

    private static DefaultHttpContext HttpContextWith(Mock<DataGatewayTokenAuthenticator> authenticator)
    {
        var services = new ServiceCollection();
        services.AddSingleton(authenticator.Object);
        return new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task AuthenticateAsync_BlankBlocksKey_IsFalseAndLeavesTheUserUntouched(string blocksKey)
    {
        RequestContextAccessor.Current = new RequestContext { BlocksKey = blocksKey };
        var authenticator = Authenticator(new ClaimsPrincipal(new ClaimsIdentity("Test")));
        var context = HttpContextWith(authenticator);
        var userBefore = context.User;

        var result = await GatewayCallerResolver.AuthenticateAsync(context);

        result.Should().BeFalse();
        context.User.Should().BeSameAs(userBefore);
        authenticator.Verify(a => a.GetPrincipalFromTokenAsync(It.IsAny<HttpRequest>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task AuthenticateAsync_APrincipalFromTheToken_IsTrueAndBecomesTheUser()
    {
        RequestContextAccessor.Current = new RequestContext { BlocksKey = "tenant-1" };
        var principal = new ClaimsPrincipal(new ClaimsIdentity("Test"));
        var authenticator = Authenticator(principal);
        var context = HttpContextWith(authenticator);

        var result = await GatewayCallerResolver.AuthenticateAsync(context);

        result.Should().BeTrue();
        context.User.Should().BeSameAs(principal);
        authenticator.Verify(a => a.GetPrincipalFromTokenAsync(context.Request, "tenant-1"), Times.Once);
    }

    [Fact]
    public async Task AuthenticateAsync_NoPrincipalFromTheToken_IsFalse()
    {
        RequestContextAccessor.Current = new RequestContext { BlocksKey = "tenant-1" };
        var context = HttpContextWith(Authenticator(null));
        var userBefore = context.User;

        var result = await GatewayCallerResolver.AuthenticateAsync(context);

        result.Should().BeFalse();
        context.User.Should().BeSameAs(userBefore);
    }

    [Fact]
    public void ResolveTenantId_ReturnsNullWhenNothingIdentifiesATenant()
    {
        ClearContext();

        GatewayCallerResolver.ResolveTenantId().Should().BeNull();
    }

    [Fact]
    public void ResolveTenantId_FallsBackToTheBlocksKey()
    {
        ClearContext();
        RequestContextAccessor.Current = new RequestContext { BlocksKey = "tenant-from-key" };

        GatewayCallerResolver.ResolveTenantId().Should().Be("tenant-from-key");
    }

    [Fact]
    public void ResolveTenantId_PrefersTheAuthenticatedTenant()
    {
        SetContext(tenantId: "tenant-from-token");
        RequestContextAccessor.Current = new RequestContext { BlocksKey = "tenant-from-key" };

        GatewayCallerResolver.ResolveTenantId().Should().Be("tenant-from-token");
    }
}
