using Blocks.Data.Api.Middleware;
using Blocks.Data.Api.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;

namespace XUnitTest.Api.Middleware;

public class SecurityHeadersMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_SetsRequiredSecurityHeaders()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/";

        var policy = ContentSecurityPolicy.BuildPolicy(
            connectSrc: ["https://iam.example.com"], imgSrc: [], formAction: []);
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, policy);
        await middleware.InvokeAsync(context);

        var headers = context.Response.Headers;
        headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
        headers["X-Frame-Options"].ToString().Should().Be("DENY");
        headers["Strict-Transport-Security"].ToString().Should().Contain("max-age=31536000");
        var csp = headers["Content-Security-Policy"].ToString();
        csp.Should().Contain("default-src 'self' blob:");
        csp.Should().Contain("frame-ancestors 'none'");
        csp.Should().Contain("script-src 'self'");
        csp.Should().Contain("style-src 'self' 'unsafe-inline'");
        csp.Should().NotContain("script-src 'self' 'unsafe-inline'");
        csp.Should().Be(policy);
        headers["Cache-Control"].ToString().Should().Contain("no-store");
    }
}
