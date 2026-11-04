using System.Collections.Concurrent;
using System.Security.Cryptography.X509Certificates;
using Blocks.Genesis;

namespace DataGateway.DomainService.Authentication;

/// <summary>
/// Keeps each tenant's token certificate in memory for a few minutes.
///
/// Without it every gateway request read the certificate from Redis and parsed it again. When
/// Redis stalled, that read failed and a signed-in user got a 401. The key includes the
/// certificate path and issue date, so a rotated certificate in the tenant document is picked up
/// at once; <see cref="Forget"/> drops an entry when a token's signature does not match it.
/// </summary>
public class TenantCertificateCache
{
    internal static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, CachedCertificate> _entries = new(StringComparer.Ordinal);
    private readonly ITenants _tenants;
    private readonly ICacheClient _cacheClient;
    private readonly IHttpClientFactory _httpClientFactory;

    public TenantCertificateCache(ITenants tenants, ICacheClient cacheClient, IHttpClientFactory httpClientFactory)
    {
        _tenants = tenants;
        _cacheClient = cacheClient;
        _httpClientFactory = httpClientFactory;
    }

    /// <summary>The tenant's public certificate, or null when it cannot be found.</summary>
    public async Task<X509Certificate2?> GetAsync(Tenant tenant)
    {
        var key = KeyFor(tenant);
        if (_entries.TryGetValue(key, out var cached) && cached.ExpiresAtUtc > DateTime.UtcNow)
        {
            return cached.Certificate;
        }

        var certificate = await JwtBearerAuthenticationExtension.GetCertificateAsync(
            tenant.TenantId,
            _tenants,
            _cacheClient.CacheDatabase(),
            _httpClientFactory).ConfigureAwait(false);

        if (certificate is not null)
        {
            _entries[key] = new CachedCertificate(certificate, DateTime.UtcNow + Lifetime);
        }

        return certificate;
    }

    /// <summary>Drops the tenant's entry, so the next request loads the certificate again.</summary>
    public void Forget(Tenant tenant) => _entries.TryRemove(KeyFor(tenant), out _);

    private static string KeyFor(Tenant tenant)
    {
        var parameters = tenant.JwtTokenParameters;
        return $"{tenant.TenantId}|{parameters?.PublicCertificatePath}|{parameters?.IssueDate:O}";
    }

    private sealed record CachedCertificate(X509Certificate2 Certificate, DateTime ExpiresAtUtc);
}
