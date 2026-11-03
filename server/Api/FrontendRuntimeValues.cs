using Microsoft.Extensions.Configuration;

namespace BlocksTemplate.Api;

/// <summary>Values the host injects into the console's <c>runtime-config.js</c> that do not come from the <c>FrontendRuntime</c> section.</summary>
public static class FrontendRuntimeValues
{
    /// <summary>Configuration key that holds the date the GraphQL API is deprecated since.</summary>
    public const string GraphQLDeprecatedSinceKey = "DataGateway:GraphQL:DeprecatedSince";

    /// <summary>The configured deprecation date, trimmed, or <c>null</c> when it is unset or blank.</summary>
    /// <remarks>Reads the raw string so the Api project does not depend on the GraphQL project.</remarks>
    public static string? GraphQLDeprecatedSince(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var value = configuration[GraphQLDeprecatedSinceKey];
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
