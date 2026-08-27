using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

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
    private const string PermissionsClaimType = "permissions";
    private const string PermissionsCollectionName = "Permissions";
    private const int MaxRolePermissionsFetch = 5000;

    private readonly ITenants _tenants;
    private readonly ICacheClient _cacheClient;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDbRepository _repository;

    public DataGatewayTokenAuthenticator(
        ITenants tenants,
        ICacheClient cacheClient,
        IHttpClientFactory httpClientFactory,
        IDbRepository repository)
    {
        _tenants = tenants;
        _cacheClient = cacheClient;
        _httpClientFactory = httpClientFactory;
        _repository = repository;
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
                var publicCert = await JwtBearerAuthenticationExtension.GetCertificateAsync(
                    tenant.TenantId,
                    _tenants,
                    _cacheClient.CacheDatabase(),
                    _httpClientFactory).ConfigureAwait(false);
                if (publicCert == null)
                {
                    return null;
                }

                var validationParams = tenant.JwtTokenParameters;
                var tokenValidationParameters = new TokenValidationParameters { ValidateLifetime = true, ClockSkew = TimeSpan.Zero, IssuerSigningKey = new X509SecurityKey(publicCert), ValidateIssuerSigningKey = true, ValidateIssuer = true, ValidIssuer = validationParams?.Issuer, ValidAudience = DomainResolver.GetAudience(tenant), ValidateAudience = true, SaveSigninToken = true };
                var validatedToken = tokenHandler.ValidateToken(token, tokenValidationParameters, out _);
                if (validatedToken is not null)
                {
                    var identity = validatedToken.Identity as ClaimsIdentity;
                    if (identity is not null)
                    {
                        await AddRolePermissionClaimsAsync(identity);
                    }
                    BlocksContext.SetContext(BlocksContext.CreateFromClaimsIdentity(identity));
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

    /// <summary>
    /// Adds a "permissions" claim for every permission granted to the token's roles (looked up in
    /// the Permissions collection, matched by role slug and organization, excluding archived
    /// permissions) that isn't already present, so the <see cref="BlocksContext"/> built from this
    /// identity carries the token's own permissions combined with role-derived ones.
    /// </summary>
    private async Task AddRolePermissionClaimsAsync(ClaimsIdentity identity)
    {
        var context = BlocksContext.CreateFromClaimsIdentity(identity);
        var roles = context.Roles?.Where(r => !string.IsNullOrWhiteSpace(r)).Distinct().ToList();
        if (roles is not { Count: > 0 }) return;

        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.In("Roles", roles),
            Builders<BsonDocument>.Filter.Ne("IsArchived", true),
            Builders<BsonDocument>.Filter.Eq("OrganizationId", context.OrganizationId));
        var projection = new BsonDocument { { "Resource", 1 }, { "_id", 0 } };

        var permissionDocs = await _repository.GetItemsAsync(
            PermissionsCollectionName, filter, projection: projection, limit: MaxRolePermissionsFetch);

        var existingPermissions = new HashSet<string>(context.Permissions ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        foreach (var doc in permissionDocs ?? [])
        {
            if (!doc.TryGetValue("Resource", out var resourceValue) || !resourceValue.IsString) continue;
            var permission = resourceValue.AsString;
            if (existingPermissions.Add(permission))
                identity.AddClaim(new Claim(PermissionsClaimType, permission));
        }
    }
}
