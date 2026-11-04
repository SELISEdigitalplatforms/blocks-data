using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Blocks.Genesis;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// Covers the audience fallback and the bearer-token validation the gateway does for itself,
/// because in Genesis the gateway path is anonymous and the framework skips it. A throwaway
/// self-signed certificate stands in for the tenant certificate so the happy path is real
/// signature validation rather than a stubbed handler.
/// </summary>
[Collection("ContextSerial")]
public class DataGatewayAuthenticationTests : IDisposable
{
    private const string CertificatePassword = "pa55word";
    private const string Issuer = "https://issuer.test";

    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    // ---------------- DomainResolver ----------------

    [Fact]
    public void GetAudience_FallsBackToTheProtectedApiAudienceForANullTenant()
        => DomainResolver.GetAudience(null).Should().Be("api://blocks-protected-api");

    [Fact]
    public void GetAudience_FallsBackWhenTheTenantConfiguresNoAudiences()
    {
        var tenant = Tenant();

        DomainResolver.GetAudience(tenant).Should().Be("api://blocks-protected-api");
    }

    [Fact]
    public void GetAudience_SkipsBlankEntriesAndTrimsTheFirstRealAudience()
    {
        var tenant = Tenant();
        tenant.JwtTokenParameters.Audiences = ["", "   ", "  api://real  ", "api://second"];

        DomainResolver.GetAudience(tenant).Should().Be("api://real");
    }

    [Fact]
    public void GetAudience_FallsBackWhenEveryConfiguredAudienceIsBlank()
    {
        var tenant = Tenant();
        tenant.JwtTokenParameters.Audiences = ["", "   "];

        DomainResolver.GetAudience(tenant).Should().Be("api://blocks-protected-api");
    }

    // ---------------- DataGatewayTokenAuthenticator ----------------

    private static Tenant Tenant(string tenantId = "tenant-1")
        => new()
        {
            TenantId = tenantId,
            DbConnectionString = "mongodb://localhost",
            JwtTokenParameters = new JwtTokenParameters
            {
                Issuer = Issuer,
                PublicCertificatePassword = CertificatePassword,
                PrivateCertificatePassword = CertificatePassword,
                IssueDate = DateTime.UtcNow
            }
        };

    private static X509Certificate2 CreateSelfSignedCertificate()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=blocks-data-tests",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        return request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1),
            DateTimeOffset.UtcNow.AddDays(1));
    }

    private static Mock<ICacheClient> CacheReturning(byte[]? certificateBytes)
    {
        var database = new Mock<IDatabase>();
        database
            .Setup(d => d.StringGetAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(certificateBytes is null ? RedisValue.Null : (RedisValue)certificateBytes);

        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.CacheDatabase()).Returns(database.Object);
        return cache;
    }

    private static HttpRequest RequestWithBearer(string? token)
    {
        var context = new DefaultHttpContext();
        if (token is not null)
        {
            context.Request.Headers.Authorization = $"Bearer {token}";
        }

        return context.Request;
    }

    private static IHttpClientFactory HttpClientFactory()
        => new Mock<IHttpClientFactory>().Object;

    private static DataGatewayTokenAuthenticator Authenticator(
        ITenants tenants, ICacheClient cache, IDbRepository repository)
        => new(tenants, new TenantCertificateCache(tenants, cache, HttpClientFactory()), repository,
            NullLogger<DataGatewayTokenAuthenticator>.Instance);

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsNullWhenTheTenantIsUnknown()
    {
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("missing")).Returns((Tenant?)null);
        var cache = CacheReturning(null);
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer("abc"), "missing");

        principal.Should().BeNull();
        // The certificate is never fetched when the tenant does not resolve.
        cache.Verify(c => c.CacheDatabase(), Times.Never);
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsNullWhenTheRequestCarriesNoToken()
    {
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var authenticator = Authenticator(tenants.Object, CacheReturning(null).Object, new Mock<IDbRepository>().Object);

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(null), "tenant-1");

        principal.Should().BeNull();
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsNullWhenTheCachedCertificateIsUnreadable()
    {
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var cache = CacheReturning([1, 2, 3, 4]);
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer("abc"), "tenant-1");

        principal.Should().BeNull();
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsNullWhenTheTokenIsNotSignedByTheTenantCertificate()
    {
        using var certificate = CreateSelfSignedCertificate();
        using var otherCertificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var cache = CacheReturning(certificate.Export(X509ContentType.Cert));
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var foreignToken = WriteToken(otherCertificate, Issuer, "api://blocks-protected-api");

        var principal = await authenticator.GetPrincipalFromTokenAsync(
            RequestWithBearer(foreignToken), "tenant-1");

        principal.Should().BeNull();
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsNullWhenTheAudienceDoesNotMatch()
    {
        using var certificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var cache = CacheReturning(certificate.Export(X509ContentType.Cert));
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var token = WriteToken(certificate, Issuer, "api://someone-else");

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(token), "tenant-1");

        principal.Should().BeNull();
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReturnsThePrincipalAndInstallsTheBlocksContext()
    {
        ClearContext();
        using var certificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var cache = CacheReturning(certificate.Export(X509ContentType.Cert));
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var token = WriteToken(certificate, Issuer, "api://blocks-protected-api");

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(token), "tenant-1");

        principal.Should().NotBeNull();
        principal!.Identity!.IsAuthenticated.Should().BeTrue();
        principal.FindFirst(ClaimTypes.NameIdentifier)?.Value.Should().Be("user-42");

        // The authenticator also calls BlocksContext.SetContext on the way out. That writes to an
        // AsyncLocal inside this async call, so it is not observable from the caller and is not
        // asserted here. See the note in the task report about the ambient-context propagation.
    }

    [Fact]
    public async Task GetPrincipalFromToken_loads_role_permissions_from_the_token_tenant()
    {
        ClearContext();
        using var certificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var repository = new Mock<IDbRepository>();
        repository.Setup(r => r.GetItemsAsync("Permissions", It.IsAny<FilterDefinition<BsonDocument>>(),
                null, It.IsAny<BsonDocument>(), 0, 5000, "tenant-1"))
            .ReturnsAsync([new BsonDocument("Resource", "read:documents")]);
        var authenticator = Authenticator(tenants.Object, CacheReturning(certificate.Export(X509ContentType.Cert)).Object, repository.Object);
        var token = WriteToken(certificate, Issuer, "api://blocks-protected-api",
            new Claim(BlocksContext.TENANT_ID_CLAIM, "tenant-1"),
            new Claim(ClaimTypes.Role, "reader"),
            new Claim(BlocksContext.ORGANIZATION_ID_CLAIM, "org-1"));

        var principal = await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(token), "tenant-1");

        principal.Should().NotBeNull();
        principal!.FindAll("permissions").Select(c => c.Value).Should().Contain("read:documents");
        repository.Verify(r => r.GetItemsAsync("Permissions", It.IsAny<FilterDefinition<BsonDocument>>(),
            null, It.IsAny<BsonDocument>(), 0, 5000, "tenant-1"), Times.Once);
    }

    // Bug 2026-11-04: a Redis stall during the certificate read was swallowed and answered 401,
    // so valid users were signed out at random. It must surface as "could not check", not "no user".
    [Fact]
    public async Task GetPrincipalFromToken_ThrowsUnavailableWhenRedisFails()
    {
        var database = new Mock<IDatabase>();
        database
            .Setup(d => d.StringGetAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .ThrowsAsync(new RedisTimeoutException("Timeout performing GET", CommandStatus.Sent));
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.CacheDatabase()).Returns(database.Object);
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);

        var act = () => authenticator.GetPrincipalFromTokenAsync(RequestWithBearer("abc"), "tenant-1");

        await act.Should().ThrowAsync<DataGatewayAuthUnavailableException>()
            .WithInnerException(typeof(RedisTimeoutException));
    }

    [Fact]
    public async Task GetPrincipalFromToken_ReadsTheCertificateFromRedisOnlyOnce()
    {
        ClearContext();
        using var certificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var cache = CacheReturning(certificate.Export(X509ContentType.Cert));
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);
        var token = WriteToken(certificate, Issuer, "api://blocks-protected-api");

        (await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(token), "tenant-1")).Should().NotBeNull();
        (await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(token), "tenant-1")).Should().NotBeNull();

        cache.Verify(c => c.CacheDatabase(), Times.Once);
    }

    // A rotated certificate must not keep failing tokens until the cache entry expires.
    [Fact]
    public async Task GetPrincipalFromToken_ReloadsTheCertificateAfterASignatureMismatch()
    {
        using var certificate = CreateSelfSignedCertificate();
        using var otherCertificate = CreateSelfSignedCertificate();
        var tenants = new Mock<ITenants>();
        tenants.Setup(t => t.GetTenantByID("tenant-1")).Returns(Tenant());
        tenants.Setup(t => t.GetTenantTokenValidationParameter("tenant-1")).Returns(Tenant().JwtTokenParameters);
        var cache = CacheReturning(certificate.Export(X509ContentType.Cert));
        var authenticator = Authenticator(tenants.Object, cache.Object, new Mock<IDbRepository>().Object);
        var foreignToken = WriteToken(otherCertificate, Issuer, "api://blocks-protected-api");

        (await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(foreignToken), "tenant-1")).Should().BeNull();
        (await authenticator.GetPrincipalFromTokenAsync(RequestWithBearer(foreignToken), "tenant-1")).Should().BeNull();

        cache.Verify(c => c.CacheDatabase(), Times.Exactly(2));
    }

    // Contract: clients sign the user out on 401, so a failed check must answer 503 + Retry-After.
    [Fact]
    public async Task AuthUnavailable_IsAnswered503WithRetryAfter()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };

        await DataGatewayGraphQLEndpointExtensions.RespondAuthUnavailableAsync(
            context, new DataGatewayAuthUnavailableException("retry", new TimeoutException()));

        context.Response.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
        context.Response.Headers.RetryAfter.ToString().Should().Be("1");
    }

    private static string WriteToken(X509Certificate2 signingCertificate, string issuer, string audience,
        params Claim[] additionalClaims)
    {
        var credentials = new SigningCredentials(
            new X509SecurityKey(signingCertificate),
            SecurityAlgorithms.RsaSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: [new Claim(ClaimTypes.NameIdentifier, "user-42"), ..additionalClaims],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
