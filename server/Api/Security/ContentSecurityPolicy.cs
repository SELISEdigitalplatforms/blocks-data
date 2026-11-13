namespace Blocks.Data.Api.Security;

/// <summary>
/// Builds the SPA's Content-Security-Policy from configuration.
/// <para>
/// The origins come from the same <c>FrontendRuntime</c> section that fills the SPA's
/// runtime config, so the policy describes whatever environment the host is actually
/// running in. They used to be a hardcoded list of <c>dev-*</c> hosts compiled into the
/// middleware, which was correct on dev and blocked the SPA from reaching its own IAM
/// and sibling services on stg/prod. This mirrors the same fix in blocks-os and blocks-iam
/// (<c>server/Api/Security/ContentSecurityPolicy.cs</c>).
/// </para>
/// </summary>
public static class ContentSecurityPolicy
{
    /// <summary>
    /// <c>FrontendRuntime</c> keys holding a URL the SPA makes requests to. Anything not
    /// derivable from these (a CDN, a storage account, a third-party service) goes in
    /// <c>Csp:ExtraConnectSrc</c> / <c>Csp:ExtraImgSrc</c> rather than back into code.
    /// </summary>
    internal static readonly string[] ConnectOriginKeys =
    [
        "BLOCKS_API_BASE_URL",
        "BLOCKS_IAM_BASE_URL",
        "BLOCKS_IDP_BASE_URL",
        "BLOCKS_CONSTRUCT_URL",
        "BLOCKS_LOCALIZATION_BASE_URL",
        "BLOCKS_AGENTS_BASE_URL",
        "BLOCKS_DATA_BASE_URL",
        "BLOCKS_UTILITIES_BASE_URL",
        "BLOCKS_LOGIC_BASE_URL",
        "BLOCKS_MONITOR_BASE_URL",
        "BLOCKS_RELEASE_BASE_URL",
        "BLOCKS_STUDIO_BASE_URL",
        "BLOCKS_OS_BASE_URL",
        "BLOCKS_OS_URL",
        "BLOCKS_APP_URL",
        // Fetched by the data-gateway schema preview and import modal.
        "BLOCKS_GRAPHQL_PUBLIC_URL",
        "BLOCKS_DATA_IMPORT_SAMPLE_FILE",
    ];

    /// <summary>
    /// Origins the SPA opens a WebSocket to (the Logic SignalR hub). A CSP source is
    /// scheme-sensitive, so <c>https://host</c> does not permit <c>wss://host</c> and the
    /// ws form has to be emitted separately.
    /// </summary>
    internal static readonly string[] WebSocketOriginKeys =
    [
        "BLOCKS_LOGIC_BASE_URL",
    ];

    /// <summary>Where a login POST may be sent: the identity host and the portal.</summary>
    internal static readonly string[] FormActionOriginKeys =
    [
        "BLOCKS_IAM_BASE_URL",
        "BLOCKS_IDP_BASE_URL",
        "BLOCKS_OS_BASE_URL",
        "BLOCKS_OS_URL",
    ];

    /// <summary>
    /// Stands in for the style nonce (see <see cref="StyleNonce"/>): in the policy built at
    /// startup and in the built index.html (meta[name=csp-nonce]). Replaced on every response.
    /// </summary>
    public const string StyleNoncePlaceholder = "__CSP_STYLE_NONCE__";

    /// <summary>The policy for one response, with the placeholder swapped for its nonce.</summary>
    public static string WithStyleNonce(string policy, string nonce)
    {
        ArgumentNullException.ThrowIfNull(policy);
        ArgumentException.ThrowIfNullOrEmpty(nonce);
        return policy.Replace(StyleNoncePlaceholder, nonce, StringComparison.Ordinal);
    }

    /// <summary>The SPA shell for one response, carrying the same nonce as its header.</summary>
    public static string RenderIndex(string indexHtmlTemplate, string nonce)
    {
        ArgumentNullException.ThrowIfNull(indexHtmlTemplate);
        ArgumentException.ThrowIfNullOrEmpty(nonce);
        return indexHtmlTemplate.Replace(StyleNoncePlaceholder, nonce, StringComparison.Ordinal);
    }

    /// <summary>Builds the policy from the <c>FrontendRuntime</c> and <c>Csp</c> sections.</summary>
    public static string Build(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var runtime = configuration.GetSection("FrontendRuntime");
        var csp = configuration.GetSection("Csp");

        return BuildPolicy(
            connectSrc: Origins(runtime, ConnectOriginKeys)
                .Concat(WebSocketOrigins(runtime, WebSocketOriginKeys))
                .Concat(Split(csp["ExtraConnectSrc"])),
            imgSrc: Split(csp["ExtraImgSrc"]),
            formAction: Origins(runtime, FormActionOriginKeys).Concat(Split(csp["ExtraFormAction"])));
    }

    /// <summary>
    /// The policy itself, separated from configuration so it can be asserted directly.
    /// </summary>
    public static string BuildPolicy(
        IEnumerable<string?> connectSrc,
        IEnumerable<string?> imgSrc,
        IEnumerable<string?> formAction)
    {
        var connect = Normalize(connectSrc);
        var img = Normalize(imgSrc);
        var form = Normalize(formAction);

        // External /runtime-config.js supplies window.__BLOCKS_ENV__ (no inline script).
        return string.Join(
            " ",
            "default-src 'self' blob:;",
            "script-src 'self';",

            // Styles. Style elements need the style nonce, see StyleNonce. The genesis-os, Radix,
            // vaul and cmdk components and the GraphQL playground editor create them at runtime.
            // The csp-nonce.js shim stamps the nonce on every style element the page creates, and
            // the server writes the same nonce into the SPA shell, see WithStyleNonce and
            // RenderIndex. This is the same approach as blocks-iam 66f9b48d, blocks-release 1ae6edc
            // and blocks-monitor b4f78c8.
            //
            // Style attributes stay allowed through style-src-attr only: components set them,
            // an attribute cannot carry a nonce, and an attribute cannot load a script.
            // script-src stays strict, which is the directive that matters for injection.
            $"style-src 'self' 'nonce-{StyleNoncePlaceholder}';",
            "style-src-attr 'unsafe-inline';",

            $"img-src 'self' data: blob:{Suffix(img)};",
            "font-src 'self' data:;",
            $"connect-src 'self'{Suffix(connect)};",
            "frame-ancestors 'none';",
            "base-uri 'self';",
            "object-src 'none';",
            $"form-action 'self'{Suffix(form)}");
    }

    /// <summary>Reduce configured values to distinct, sorted origins.</summary>
    private static List<string> Normalize(IEnumerable<string?> values) =>
        values
            .Select(ToOrigin)
            .Where(origin => origin is not null)
            .Select(origin => origin!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(origin => origin, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static IEnumerable<string?> Origins(IConfiguration section, IEnumerable<string> keys) =>
        keys.Select(key => section[key]);

    /// <summary>Same origins as <see cref="Origins"/>, re-scheme'd to ws/wss.</summary>
    private static IEnumerable<string?> WebSocketOrigins(IConfiguration section, IEnumerable<string> keys) =>
        keys.Select(key => ToWebSocketOrigin(section[key]));

    /// <summary>
    /// A CSP source is an origin, so any path, query or trailing slash is dropped. A value
    /// that is not an absolute http(s)/ws(s) URL -- including an unfilled <c>__BLOCKS_*__</c>
    /// placeholder -- is ignored rather than emitted verbatim, so a malformed secret cannot
    /// inject a directive.
    /// </summary>
    public static string? ToOrigin(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return null;

        if (uri.Scheme != Uri.UriSchemeHttp
            && uri.Scheme != Uri.UriSchemeHttps
            && uri.Scheme != Uri.UriSchemeWs
            && uri.Scheme != Uri.UriSchemeWss) return null;

        return uri.GetLeftPart(UriPartial.Authority);
    }

    /// <summary>The WebSocket origin (wss scheme for https, ws for http) of an http(s) origin, or null if it is not one.</summary>
    public static string? ToWebSocketOrigin(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return null;

        if (uri.Scheme == Uri.UriSchemeHttps) return $"wss://{uri.Authority}";
        // An http origin's WebSocket counterpart is plain ws, which CSP connect-src must list as is.
        // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
        if (uri.Scheme == Uri.UriSchemeHttp) return $"ws://{uri.Authority}";

        return null;
    }

    /// <summary>Space- or comma-separated list, for origins no runtime key describes.</summary>
    public static IEnumerable<string?> Split(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split([' ', ',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static string Suffix(List<string> origins) =>
        origins.Count == 0 ? string.Empty : " " + string.Join(" ", origins);
}
