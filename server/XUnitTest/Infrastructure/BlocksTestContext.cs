using Blocks.Genesis;

namespace XUnitTest.Infrastructure;

/// <summary>
/// Helper to install a BlocksContext for the current async flow so that code paths
/// relying on BlocksContext.GetContext() (default value injection, caching, etc.) run.
/// </summary>
public static class BlocksTestContext
{
    public static BlocksContext Set(
        string userId = "user-1",
        string organizationId = "org-1",
        string tenantId = "tenant-1",
        IEnumerable<string>? roles = null,
        IEnumerable<string>? permissions = null,
        string email = "user@example.com")
    {
        var ctx = BlocksContext.Create(
            tenantId: tenantId,
            roles: roles ?? new[] { "User" },
            userId: userId,
            isAuthenticated: true,
            requestUri: "/graphql",
            organizationId: organizationId,
            expireOn: DateTime.UtcNow.AddHours(1),
            email: email,
            permissions: permissions ?? Array.Empty<string>(),
            userName: "user",
            phoneNumber: "",
            displayName: "User",
            oauthToken: "",
            originalTenantId: tenantId);
        BlocksContext.SetContext(ctx);
        return ctx;
    }

    public static void Clear() => BlocksContext.SetContext(null);

    public static Tenant Tenant(string tenantId = "t1", string tenantGroupId = "", string environment = "")
        => new()
        {
            TenantId = tenantId,
            TenantGroupId = tenantGroupId,
            Environment = environment,
            DbConnectionString = "mongodb://localhost",
            JwtTokenParameters = new JwtTokenParameters { PrivateCertificatePassword = "", IssueDate = DateTime.UtcNow }
        };
}
