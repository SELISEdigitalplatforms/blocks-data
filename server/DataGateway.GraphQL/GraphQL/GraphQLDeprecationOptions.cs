namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Announces that GraphQL at <c>/api/gateway</c> is deprecated in favour of the REST API, bound from configuration
/// section <see cref="SectionName"/>. Nothing is announced until <see cref="DeprecatedSince"/> is set; with no
/// configuration the GraphQL responses carry no extra headers at all. Checked when the host starts: a date that does
/// not parse, a <see cref="SunsetDate"/> not after <see cref="DeprecatedSince"/>, or a <see cref="MigrationGuideUrl"/>
/// that is not an absolute http(s) URL stops the start.
/// </summary>
public sealed class GraphQLDeprecationOptions
{
    public const string SectionName = "DataGateway:GraphQL";

    /// <summary>When GraphQL was deprecated. Set, every GraphQL response carries <c>Deprecation: @&lt;unix seconds&gt;</c> (RFC 9745).</summary>
    public DateTimeOffset? DeprecatedSince { get; set; }

    /// <summary>When GraphQL stops being served. Set (with <see cref="DeprecatedSince"/>), responses also carry <c>Sunset</c> as an HTTP-date (RFC 8594).</summary>
    public DateTimeOffset? SunsetDate { get; set; }

    /// <summary>Where the migration guide lives. Set (with <see cref="DeprecatedSince"/>), responses also carry <c>Link: &lt;url&gt;; rel="deprecation"</c>.</summary>
    public string? MigrationGuideUrl { get; set; }

    /// <summary>Whether <paramref name="url"/> is an absolute <c>http</c> or <c>https</c> URL, as <see cref="MigrationGuideUrl"/> must be.</summary>
    internal static bool IsHttpUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
