using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Moq;

namespace XUnitTest.DataGateway;

public class RequestContextMiddlewareTests
{
    private const string BlocksKeyHeader = "x-blocks-key";

    private static Tenant Tenant(bool isRootTenant) => new()
    {
        IsRootTenant = isRootTenant,
        DbConnectionString = "mongodb://localhost:27017",
        JwtTokenParameters = new JwtTokenParameters
        {
            PrivateCertificatePassword = "pwd",
            IssueDate = DateTime.UtcNow,
        },
    };

    private static HttpContext Request(string? blocksKey, string path = "/graphql")
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Scheme = "https";
        httpContext.Request.Host = new HostString("data.example.com");
        httpContext.Request.Path = path;
        if (blocksKey is not null)
            httpContext.Request.Headers[BlocksKeyHeader] = blocksKey;
        return httpContext;
    }

    /// <summary>
    /// The context is published through an AsyncLocal, which does not flow back out to the caller.
    /// It has to be read from inside the next delegate, which is how downstream middleware sees it.
    /// </summary>
    private sealed class Downstream
    {
        public List<HttpContext> Forwarded { get; } = [];
        public RequestContext? Seen { get; private set; }

        public Task Invoke(HttpContext ctx)
        {
            Forwarded.Add(ctx);
            Seen = RequestContextAccessor.Current;
            return Task.CompletedTask;
        }
    }

    private static (RequestContextMiddleware Middleware, Downstream Next) Build(Tenant? tenant)
    {
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID(It.IsAny<string>())).Returns(tenant);

        var downstream = new Downstream();
        return (new RequestContextMiddleware(downstream.Invoke, tenants.Object), downstream);
    }

    [Fact]
    public async Task InvokeAsync_PublishesTheTenantFromTheBlocksKeyHeader()
    {
        var (middleware, next) = Build(Tenant(isRootTenant: false));
        var httpContext = Request("tenant-1");

        await middleware.InvokeAsync(httpContext);

        var ctx = next.Seen.Should().NotBeNull().And.Subject.As<RequestContext>();
        ctx.BlocksKey.Should().Be("tenant-1");
        ctx.TenantId.Should().Be("tenant-1");
        ctx.RequestPath.Should().Be("/graphql");
        ctx.RequestUri.Should().Be("https://data.example.com/graphql");
        ctx.HttpContext.Should().BeSameAs(httpContext);
        next.Forwarded.Should().ContainSingle().Which.Should().BeSameAs(httpContext);
    }

    [Fact]
    public async Task InvokeAsync_FlagsRequestsFromABlocksCloudRootTenant()
    {
        var (middleware, next) = Build(Tenant(isRootTenant: true));

        await middleware.InvokeAsync(Request("root-tenant"));

        next.Seen!.IsRequestFromBlocksCloud.Should().BeTrue();
    }

    [Fact]
    public async Task InvokeAsync_DoesNotFlagBlocksCloudForAnUnknownTenant()
    {
        var (middleware, next) = Build(tenant: null);

        await middleware.InvokeAsync(Request("tenant-1"));

        next.Seen!.IsRequestFromBlocksCloud.Should().BeFalse();
    }

    [Fact]
    public async Task InvokeAsync_StillForwardsWhenTheBlocksKeyHeaderIsAbsent()
    {
        var (middleware, next) = Build(tenant: null);

        await middleware.InvokeAsync(Request(blocksKey: null));

        next.Seen!.BlocksKey.Should().BeEmpty();
        next.Forwarded.Should().ContainSingle();
    }
}
