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
        var nonces = new StyleNonce(Key);
        var seed = StyleNonce.NewSeed();
        context.Request.Headers.Cookie = $"{StyleNonce.SeedCookieName}={seed}";
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, policy, nonces);
        await middleware.InvokeAsync(context);

        var headers = context.Response.Headers;
        headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
        headers["X-Frame-Options"].ToString().Should().Be("DENY");
        headers["Strict-Transport-Security"].ToString().Should().Contain("max-age=31536000");
        var csp = headers["Content-Security-Policy"].ToString();
        csp.Should().Contain("default-src 'self' blob:");
        csp.Should().Contain("frame-ancestors 'none'");
        csp.Should().Contain("script-src 'self'");
        csp.Should().Contain($"style-src 'self' 'nonce-{nonces.For(seed)}'");
        csp.Should().Contain("style-src-attr 'unsafe-inline'");
        csp.Should().NotContain("style-src 'self' 'unsafe-inline'");
        csp.Should().NotContain("script-src 'self' 'unsafe-inline'");
        csp.Should().Be(ContentSecurityPolicy.WithStyleNonce(policy, nonces.For(seed)));
        headers["Cache-Control"].ToString().Should().Contain("no-store");
    }

    private static readonly byte[] Key = Enumerable.Range(1, 32).Select(i => (byte)i).ToArray();

    private static string Csp => ContentSecurityPolicy.BuildPolicy([], [], []);

    [Fact]
    public async Task InvokeAsync_stamps_the_style_nonce_into_the_policy_and_the_context()
    {
        var nonces = new StyleNonce(Key);
        var seed = StyleNonce.NewSeed();
        var context = new DefaultHttpContext();
        context.Request.Path = "/data-gateway/schemas";
        context.Request.Headers.Cookie = $"{StyleNonce.SeedCookieName}={seed}";
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, Csp, nonces);

        await middleware.InvokeAsync(context);

        var nonce = nonces.For(seed);
        context.Items[SecurityHeadersMiddleware.StyleNonceItemKey].Should().Be(nonce);
        var policy = context.Response.Headers["Content-Security-Policy"].ToString();
        policy.Should().Contain($"style-src 'self' 'nonce-{nonce}'");
        policy.Should().NotContain(ContentSecurityPolicy.StyleNoncePlaceholder);
    }

    [Fact]
    public async Task InvokeAsync_gives_the_same_browser_the_same_nonce()
    {
        // ZAP 10104 compares two responses for one page: one browser must get one shell.
        var nonces = new StyleNonce(Key);
        var seed = StyleNonce.NewSeed();
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, Csp, nonces);
        var policies = new List<string>();
        for (var i = 0; i < 2; i++)
        {
            var context = new DefaultHttpContext();
            context.Request.Path = "/";
            context.Request.Headers.Cookie = $"{StyleNonce.SeedCookieName}={seed}";
            await middleware.InvokeAsync(context);
            policies.Add(context.Response.Headers["Content-Security-Policy"].ToString());
        }

        policies[0].Should().Be(policies[1]);
    }

    [Fact]
    public async Task InvokeAsync_keeps_a_policy_the_response_already_has()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/gateway";
        context.Response.Headers["Content-Security-Policy"] = "default-src 'none'";
        var middleware = new SecurityHeadersMiddleware(_ => Task.CompletedTask, Csp, new StyleNonce(Key));

        await middleware.InvokeAsync(context);

        context.Response.Headers["Content-Security-Policy"].ToString().Should().Be("default-src 'none'");
    }
}
