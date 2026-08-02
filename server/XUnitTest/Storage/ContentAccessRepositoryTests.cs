using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;

namespace XUnitTest.Storage;

/// <summary>
/// Exercises the access-entry store against a real mongod. Expiry is enforced by the
/// query rather than by the caller, so it is only actually proven by running the queries;
/// a mocked driver would assert the shape of a filter that might still return the wrong rows.
/// Tenant isolation is enforced by <see cref="IDbContextProvider"/>, not by query filters.
/// </summary>
[Collection("Mongo")]
public class ContentAccessRepositoryTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _repository;

    public ContentAccessRepositoryTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>()))
            .Returns((string name) => _db.GetCollection<ContentAccessPolicy>(name));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>()))
            .Returns((string name) => _db.GetCollection<ContentAuditLog>(name));

        _repository = new ContentAccessRepository(provider.Object);
        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private static ContentAccessPolicy Policy(
        string resourceId,
        string tenantId = "tenant-1",
        DateTime? expiresAt = null,
        ContentPrincipalType principalType = ContentPrincipalType.User,
        string? principalId = "user-1") => new()
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = tenantId,
            ResourceId = resourceId,
            ResourceType = ContentResourceType.File,
            PrincipalType = principalType,
            PrincipalId = principalId,
            Permission = ContentPermission.View,
            Effect = ContentEffect.Allow,
            ExpiresAt = expiresAt,
            CreatedDate = DateTime.UtcNow,
        };

    [Fact]
    public async Task Granting_then_reading_returns_the_entry()
    {
        var policy = Policy("file-1");

        await _repository.GrantAsync(policy);
        var found = await _repository.GetByResourceAsync("file-1");

        found.Should().ContainSingle();
        found[0].ItemId.Should().Be(policy.ItemId);
        found[0].Permission.Should().Be(ContentPermission.View);
    }

    [Fact]
    public async Task An_expired_entry_is_excluded_while_an_unexpired_one_is_kept()
    {
        await _repository.GrantAsync(Policy("file-1", expiresAt: DateTime.UtcNow.AddMinutes(-1)));
        var live = Policy("file-1", expiresAt: DateTime.UtcNow.AddHours(1));
        await _repository.GrantAsync(live);

        var found = await _repository.GetByResourceAsync("file-1");

        found.Should().ContainSingle();
        found[0].ItemId.Should().Be(live.ItemId);
    }

    [Fact]
    public async Task An_entry_with_no_expiry_is_treated_as_permanent()
    {
        // The filter has to admit a null expiry rather than compare against it, which is
        // easy to get wrong and would silently drop every permanent grant.
        var permanent = Policy("file-1", expiresAt: null);
        await _repository.GrantAsync(permanent);

        var found = await _repository.GetByResourceAsync("file-1");

        found.Should().ContainSingle();
        found[0].ItemId.Should().Be(permanent.ItemId);
    }

    [Fact]
    public async Task Reading_several_resources_returns_them_in_one_call()
    {
        await _repository.GrantAsync(Policy("file-1"));
        await _repository.GrantAsync(Policy("file-2"));
        await _repository.GrantAsync(Policy("file-3"));

        var found = await _repository.GetByResourcesAsync(new[] { "file-1", "file-3", "missing" });

        found.Select(p => p.ResourceId).Should().BeEquivalentTo(new[] { "file-1", "file-3" });
    }

    [Fact]
    public async Task Reading_several_resources_tolerates_an_empty_or_null_input()
    {
        (await _repository.GetByResourcesAsync(Array.Empty<string>())).Should().BeEmpty();
        (await _repository.GetByResourceAsync(string.Empty)).Should().BeEmpty();
    }

    [Fact]
    public async Task The_partition_probe_reports_only_resources_that_carry_entries()
    {
        await _repository.GrantAsync(Policy("file-1"));
        await _repository.GrantAsync(Policy("file-1"));
        await _repository.GrantAsync(Policy("file-2"));

        var withPolicies = await _repository.GetResourceIdsWithPoliciesAsync(new[] { "file-1", "file-2", "file-3" });

        withPolicies.Should().BeEquivalentTo(new[] { "file-1", "file-2" });
    }

    [Fact]
    public async Task The_partition_probe_ignores_expired_entries()
    {
        // A resource whose only entry has expired must fall back to inheritance rather
        // than being treated as having its own policy.
        await _repository.GrantAsync(Policy("file-1", expiresAt: DateTime.UtcNow.AddMinutes(-1)));

        var withPolicies = await _repository.GetResourceIdsWithPoliciesAsync(new[] { "file-1" });

        withPolicies.Should().BeEmpty();
    }

    [Fact]
    public async Task Updating_an_entry_replaces_it_in_place()
    {
        var policy = Policy("file-1");
        await _repository.GrantAsync(policy);

        policy.Permission = ContentPermission.Manage;
        policy.Effect = ContentEffect.Deny;
        await _repository.UpdateAsync(policy);

        var found = await _repository.GetByResourceAsync("file-1");
        found.Should().ContainSingle();
        found[0].Permission.Should().Be(ContentPermission.Manage);
        found[0].Effect.Should().Be(ContentEffect.Deny);
    }

    [Fact]
    public async Task Revoking_removes_the_entry_and_reports_whether_it_existed()
    {
        var policy = Policy("file-1");
        await _repository.GrantAsync(policy);

        (await _repository.RevokeAsync(policy.ItemId)).Should().BeTrue();
        (await _repository.GetByResourceAsync("file-1")).Should().BeEmpty();
        (await _repository.RevokeAsync(policy.ItemId)).Should().BeFalse();
        (await _repository.RevokeAsync(string.Empty)).Should().BeFalse();
    }

    [Fact]
    public async Task Revoking_everything_for_a_resource_clears_only_that_resource()
    {
        await _repository.GrantAsync(Policy("file-1"));
        await _repository.GrantAsync(Policy("file-1", principalId: "user-2"));
        await _repository.GrantAsync(Policy("file-2"));

        var removed = await _repository.RevokeAllForResourceAsync("file-1");

        removed.Should().Be(2);
        (await _repository.GetByResourceAsync("file-1")).Should().BeEmpty();
        (await _repository.GetByResourceAsync("file-2")).Should().ContainSingle();
    }

    [Fact]
    public async Task Audit_entries_are_written_and_returned_newest_first()
    {
        var older = new ContentAuditLog
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ContentResourceType.File,
            UserId = "user-1",
            Action = "View",
            Granted = true,
            CreatedDate = DateTime.UtcNow.AddMinutes(-5),
        };
        var newer = new ContentAuditLog
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ContentResourceType.File,
            UserId = "user-1",
            Action = "Download",
            Granted = false,
            CreatedDate = DateTime.UtcNow,
        };

        await _repository.WriteAuditAsync(older);
        await _repository.WriteAuditAsync(newer);

        var entries = await _repository.GetAuditForResourceAsync("file-1");

        entries.Should().HaveCount(2);
        entries[0].Action.Should().Be("Download");
        entries[0].Granted.Should().BeFalse("a denied attempt must be recorded, not dropped");
    }

    [Fact]
    public async Task Audit_reads_are_bounded()
    {
        for (var i = 0; i < 5; i++)
        {
            await _repository.WriteAuditAsync(new ContentAuditLog
            {
                ItemId = Guid.NewGuid().ToString(),
                TenantId = "tenant-1",
                ResourceId = "file-1",
                ResourceType = ContentResourceType.File,
                UserId = "user-1",
                Action = "View",
                Granted = true,
                CreatedDate = DateTime.UtcNow.AddSeconds(-i),
            });
        }

        var entries = await _repository.GetAuditForResourceAsync("file-1", limit: 2);

        entries.Should().HaveCount(2);
        (await _repository.GetAuditForResourceAsync(string.Empty)).Should().BeEmpty();
    }

    [Fact]
    public async Task Indexes_are_created_once_and_cover_the_resource_lookup()
    {
        await _repository.GrantAsync(Policy("file-1"));
        await _repository.GetByResourceAsync("file-1");

        var indexes = await (await _db.GetCollection<ContentAccessPolicy>("ContentAccessPolicies")
            .Indexes.ListAsync()).ToListAsync();

        indexes.Should().Contain(i => i["key"].AsBsonDocument.Contains("ResourceId"));
    }
}
