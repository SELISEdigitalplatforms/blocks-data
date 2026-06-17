using Blocks.Genesis;

namespace DataGateway.DomainService.Authentication;

public static class DomainResolver
{
    public static string GetAudience(Tenant? tenant)
    {
        var configuredAudience = tenant?.JwtTokenParameters?.Audiences?
            .FirstOrDefault(audience => !string.IsNullOrWhiteSpace(audience));

        if (!string.IsNullOrWhiteSpace(configuredAudience))
        {
            return configuredAudience.Trim();
        }

        return "api://blocks-protected-api";
    }
}
