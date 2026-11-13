using Blocks.Data.Api.Security;

namespace Blocks.Data.Api.Middleware;

/// <summary>
/// Browser security headers for SPA + API (OWASP ZAP DAST bar). The policy is built from
/// configuration once at startup (<see cref="ContentSecurityPolicy"/>); only its style nonce
/// varies per response (<see cref="StyleNonce"/>).
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    /// <summary><see cref="HttpContext.Items"/> key for the response's style nonce.</summary>
    public const string StyleNonceItemKey = "csp-style-nonce";

    // Built once from configuration at startup; only the style nonce varies per response.
    // See Blocks.Data.Api.Security.ContentSecurityPolicy.
    private readonly string _contentSecurityPolicy;
    private readonly StyleNonce _styleNonces;

    /// <summary>Creates the middleware with the policy built at startup and the nonce source.</summary>
    public SecurityHeadersMiddleware(RequestDelegate next, string contentSecurityPolicy, StyleNonce styleNonces)
    {
        _next = next;
        _contentSecurityPolicy = contentSecurityPolicy;
        _styleNonces = styleNonces;
    }

    /// <summary>Sets the headers now and again when the response starts.</summary>
    public async Task InvokeAsync(HttpContext context)
    {
        // The response's style nonce, stable per browser (see StyleNonce). The SPA shell is
        // rendered with the same value as the header (SpaShell).
        var styleNonce = _styleNonces.ForRequest(context);
        context.Items[StyleNonceItemKey] = styleNonce;
        var policy = ContentSecurityPolicy.WithStyleNonce(_contentSecurityPolicy, styleNonce);

        Apply(context, policy);
        context.Response.OnStarting(() =>
        {
            Apply(context, policy);
            return Task.CompletedTask;
        });

        await _next(context);
    }

    internal static void Apply(HttpContext context, string contentSecurityPolicy)
    {
        var headers = context.Response.Headers;
        var path = context.Request.Path.Value ?? string.Empty;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";

        if (!headers.ContainsKey("Content-Security-Policy"))
        {
            headers["Content-Security-Policy"] = contentSecurityPolicy;
        }

        if (!headers.ContainsKey("Cache-Control"))
        {
            ApplyCacheControl(headers, path);
        }
    }

    private static void ApplyCacheControl(IHeaderDictionary headers, string path)
    {
        if (path.StartsWith("/api", StringComparison.OrdinalIgnoreCase)
            || path == "/"
            || path.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
            || !Path.HasExtension(path))
        {
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
            headers["Pragma"] = "no-cache";
        }
        else if (path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase))
        {
            headers["Cache-Control"] = "public, max-age=31536000, immutable";
        }
    }
}
