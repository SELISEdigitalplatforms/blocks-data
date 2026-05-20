using System;
using Blocks.Genesis;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Helpers;

public static class TenantHelper
{
    private static readonly Dictionary<string, string> EnvToShortKeyMap = new(StringComparer.OrdinalIgnoreCase)
    {
        { "dev", "d" },
        { "test", "t" },
        { "stg", "s" },
        { "iat", "i" },
        { "uat", "u" },
        { "prod-shadow", "h" },
        { "pre-prod", "r" },
        { "prod", "p" }
    };

    // Reverse dictionary for shortkey -> env mapping
    private static readonly Dictionary<string, string> ShortKeyToEnvMap =
        EnvToShortKeyMap.ToDictionary(kvp => kvp.Value, kvp => kvp.Key, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Gets the short key for a given environment name
    /// </summary>
    /// <param name="env">Environment name (e.g., "dev", "prod")</param>
    /// <returns>Short key (e.g., "d", "p"), or "n" for unknown environments</returns>
    public static string GetEnvShortKey(string env)
    {
        if (string.IsNullOrWhiteSpace(env))
            return "n";

        return EnvToShortKeyMap.TryGetValue(env, out var shortKey) ? shortKey : "n";
    }

    /// <summary>
    /// Gets the environment name for a given short key
    /// </summary>
    /// <param name="shortKey">Short key (e.g., "d", "p")</param>
    /// <returns>Environment name (e.g., "dev", "prod"), or empty string if not found</returns>
    public static string GetEnvFromShortKey(string shortKey)
    {
        if (string.IsNullOrWhiteSpace(shortKey))
            return string.Empty;

        return ShortKeyToEnvMap.TryGetValue(shortKey, out var env) ? env : string.Empty;
    }

    /// <summary>
    /// Gets all environment to short key mappings
    /// </summary>
    public static IReadOnlyDictionary<string, string> GetAllEnvMappings() => EnvToShortKeyMap;

    /// <summary>
    /// Gets all short key to environment mappings
    /// </summary>
    public static IReadOnlyDictionary<string, string> GetAllShortKeyMappings() => ShortKeyToEnvMap;



    public static string GetProjectShortKey(this Tenant tenant, string blocksGuidEncodedValue)
    {
        if (string.IsNullOrWhiteSpace(blocksGuidEncodedValue))
            return string.Empty;

        return $"{GetEnvShortKey(tenant.Environment)}{blocksGuidEncodedValue}";
    }

    public static string GetProjectShortKeyFromRequestUri()
    {
        var requestUri = BlocksContext.GetContext()?.RequestUri;

        if (string.IsNullOrWhiteSpace(requestUri))
            return string.Empty;

        return GetTenantSlugFromRequestUri(requestUri);
    }
    public static string GetTenantSlugFromRequestUri(string requestUri)
    {
        var questionMarkIndex = requestUri.IndexOf('?');
        if (questionMarkIndex >= 0)
        {
            requestUri = requestUri.Substring(0, questionMarkIndex);
        }
        // Try to parse as URI
        if (Uri.TryCreate(requestUri, UriKind.Absolute, out var parsedUri))
        {
            // Otherwise, get last segment before 'graphql'
            var segments = parsedUri.AbsolutePath.TrimEnd('/').Split('/');
            for (int i = segments.Length - 1; i >= 0; i--)
            {
                if (string.Equals(segments[i], GraphQlConstant.GraphQLPath, StringComparison.OrdinalIgnoreCase) && i > 0)
                {
                    // Return the segment before 'graphql'
                    return segments[i - 1];
                }
            }
        }
        return string.Empty;
    }

}