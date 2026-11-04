using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
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
///
/// A token that is wrong (bad signature, expired, wrong audience, malformed) gives null, which the
/// gateway answers with 401. A failure of a service the check needs (Redis, Mongo) throws
/// <see cref="DataGatewayAuthUnavailableException"/> instead, answered with 503: it says nothing
/// about the token, and a 401 there signed valid users out.
/// </summary>
public class DataGatewayTokenAuthenticator
{
    private const string PermissionsClaimType = "permissions";
    private const string PermissionsCollectionName = "Permissions";
    private const int MaxRolePermissionsFetch = 5000;

    private readonly ITenants _tenants;
    private readonly TenantCertificateCache _certificates;
    private readonly IDbRepository _repository;
    private readonly ILogger<DataGatewayTokenAuthenticator> _logger;

    public DataGatewayTokenAuthenticator(
        ITenants tenants,
        TenantCertificateCache certificates,
        IDbRepository repository,
        ILogger<DataGatewayTokenAuthenticator> logger)
    {
        _tenants = tenants;
        _certificates = certificates;
        _repository = repository;
        _logger = logger;
    }

    public async Task<ClaimsPrincipal?> GetPrincipalFromTokenAsync(HttpRequest request, string tenantId)
    {
        var (token, _) = TokenHelper.GetToken(request, _tenants);
        var tenant = _tenants.GetTenantByID(tenantId);
        if (tenant == null || string.IsNullOrEmpty(token))
        {
            return null;
        }

        try
        {
            return await ValidateAsync(token, tenant).ConfigureAwait(false);
        }
        catch (Exception ex) when (IsRejectedToken(ex))
        {
            if (ex is SecurityTokenSignatureKeyNotFoundException or SecurityTokenInvalidSignatureException)
            {
                // The certificate may have been rotated since it was cached.
                _certificates.Forget(tenant);
            }

            _logger.LogInformation( // NOSONAR S6667 — type only: token error text can echo parts of the token
                "Gateway token rejected for tenant {TenantId} ({ExceptionType})", tenant.TenantId, ex.GetType().Name);
            return null;
        }
        catch (Exception ex)
        {
            throw new DataGatewayAuthUnavailableException(
                "The access token could not be checked right now. Please retry.", ex);
        }
    }

    /// <summary>Errors that mean the token itself (or the tenant's certificate) is wrong.</summary>
    private static bool IsRejectedToken(Exception ex) =>
        ex is SecurityTokenException or ArgumentException or CryptographicException;

    private async Task<ClaimsPrincipal?> ValidateAsync(string token, Tenant tenant)
    {
        var publicCert = await _certificates.GetAsync(tenant).ConfigureAwait(false);
        if (publicCert == null)
        {
            _logger.LogWarning("No token certificate for tenant {TenantId}; the gateway request is anonymous", tenant.TenantId);
            return null;
        }

        var validationParams = tenant.JwtTokenParameters;
        var tokenValidationParameters = new TokenValidationParameters
        {
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            IssuerSigningKey = new X509SecurityKey(publicCert),
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidIssuer = validationParams?.Issuer,
            ValidAudience = DomainResolver.GetAudience(tenant),
            ValidateAudience = true,
            SaveSigninToken = true
        };

        var validatedToken = new JwtSecurityTokenHandler().ValidateToken(token, tokenValidationParameters, out _);
        var identity = validatedToken.Identity as ClaimsIdentity;
        if (identity is not null)
        {
            await AddRolePermissionClaimsAsync(identity);
        }

        var context = BlocksContext.CreateFromClaimsIdentity(identity);
        BlocksContext.SetContext(context);
        if (context.Impersonated)
            JwtBearerAuthenticationExtension.StoreBlocksContextInActivity(context);

        return validatedToken;
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
            PermissionsCollectionName, filter, projection: projection, limit: MaxRolePermissionsFetch,
            databaseName: context.TenantId);

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
