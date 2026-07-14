using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using Blocks.Genesis;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Tokens;

namespace DataGateway.DomainService.Authentication;

/// <summary>
/// Validates the bearer token for the data gateway endpoint.
///
/// In Genesis 10.0.16 the gateway path is a public (anonymous) endpoint, so the framework does not
/// validate the token for it. When a request reaches <c>/api/gateway</c> with a token we validate it
/// here against the tenant's public certificate and produce the <see cref="ClaimsPrincipal"/> so the
/// rest of the request (tenant resolution, RLS/CLS, BlocksContext) sees the authenticated identity.
/// </summary>
public class DataGatewayTokenAuthenticator
{
    private const string Public_Cert_Cache_Prefix = "tetocertpublic::";

    private readonly ITenants _tenants;
    private readonly ICacheClient _cacheClient;

    public DataGatewayTokenAuthenticator(ITenants tenants, ICacheClient cacheClient)
    {
        _tenants = tenants;
        _cacheClient = cacheClient;
    }

    public async Task<ClaimsPrincipal?> GetPrincipalFromTokenAsync(HttpRequest request, string tenantId)
    {
        var (token, _) = TokenHelper.GetToken(request, _tenants);
        var tenant = _tenants.GetTenantByID(tenantId);
        if (tenant == null)
        {
            return null;
        }
        try
        {
            if (!string.IsNullOrEmpty(token))
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                string cacheKey = $"{Public_Cert_Cache_Prefix}{tenant.TenantId}";
                var certificateData = await _cacheClient.CacheDatabase().StringGetAsync(cacheKey);
                var validationParams = tenant.JwtTokenParameters;
                var publicCert = X509CertificateLoader.LoadPkcs12(certificateData, validationParams.PublicCertificatePassword);
                var tokenValidationParameters = new TokenValidationParameters { ValidateLifetime = true, ClockSkew = TimeSpan.Zero, IssuerSigningKey = new X509SecurityKey(publicCert), ValidateIssuerSigningKey = true, ValidateIssuer = true, ValidIssuer = validationParams?.Issuer, ValidAudience = DomainResolver.GetAudience(tenant), ValidateAudience = true, SaveSigninToken = true };
                var validatedToken = tokenHandler.ValidateToken(token, tokenValidationParameters, out _);
                if (validatedToken is not null)
                {
                    BlocksContext.SetContext(BlocksContext.CreateFromClaimsIdentity(validatedToken.Identity as ClaimsIdentity));
                }
                return validatedToken;
            }
            Console.WriteLine("No token found");
            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error validating token: {ex.Message}");
            return null;
        }
    }
}
