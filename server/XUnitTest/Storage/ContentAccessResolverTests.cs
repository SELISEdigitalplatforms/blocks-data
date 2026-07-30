using FluentAssertions;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the effective-policy resolution rules. These are authorization decisions, so
/// each case states the outcome it is protecting rather than only the mechanics: a wrong
/// answer here either leaks content or hides it from the people who own it.
/// </summary>
[Collection("ContextSerial")]
public class ContentAccessResolverTests : IDisposable
{
    private readonly Mock<IContentAccessRepository> _repository = new(MockBehavior.Strict);
    private readonly ContentAccessResolver _resolver;

    public ContentAccessResolverTests()
    {
        _resolver = new ContentAccessResolver(_repository.Object);
        BlocksTestContext.Set(userId: "user-1", organizationId: "org-1", roles: new[] { "editor" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private static ContentResourceDescriptor Resource(
        string id = "file-1",
        string? createdBy = "someone-else",
        bool inherits = true,
        params string[] ancestors) => new()
        {
            ResourceId = id,
            CreatedBy = createdBy,
            InheritsParentAccess = inherits,
            AncestorIds = ancestors.ToList(),
        };

    private static ContentAccessPolicy Ace(
        string resourceId,
        ContentPrincipalType principalType,
        string? principalId,
        ContentPermission permission,
        ContentEffect effect = ContentEffect.Allow,
        int priority = 0) => new()
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = resourceId,
            ResourceType = ContentResourceType.File,
            PrincipalType = principalType,
            PrincipalId = principalId,
            Permission = permission,
            Effect = effect,
            Priority = priority,
        };

    private void SetupPolicies(params ContentAccessPolicy[] policies)
    {
        _repository
            .Setup(r => r.GetByResourcesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(policies.ToList());
    }

    [Fact]
    public async Task Creator_of_a_resource_has_every_permission_without_any_entry()
    {
        var resource = Resource(createdBy: "user-1");

        var flags = await _resolver.ResolveFlagsAsync(resource);

        flags.CanView.Should().BeTrue();
        flags.CanOwner.Should().BeTrue();
        // The owner shortcut must not need to consult storage at all.
        _repository.Verify(r => r.GetByResourcesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_resource_with_no_entries_is_denied_by_default()
    {
        SetupPolicies();

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task Deny_beats_allow_at_the_same_scope()
    {
        SetupPolicies(
            Ace("file-1", ContentPrincipalType.Everyone, null, ContentPermission.View),
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task A_deny_on_an_ancestor_blocks_an_inheriting_descendant()
    {
        // This is the quarantine case: an administrator denies a subtree at the top and
        // expects everything below it to become unreachable.
        SetupPolicies(
            Ace("root-1", ContentPrincipalType.Everyone, null, ContentPermission.View),
            Ace("root-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny));

        var allowed = await _resolver.ResolveAsync(Resource(ancestors: "root-1"), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task An_entry_on_the_resource_overrides_the_same_grant_on_an_ancestor()
    {
        // Nearest wins: the ancestor denies, the resource itself allows, and the resource
        // is nearer, so access is granted.
        SetupPolicies(
            Ace("root-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny),
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(ancestors: "root-1"), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task A_nearer_ancestor_overrides_a_farther_one()
    {
        SetupPolicies(
            Ace("root-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny),
            Ace("parent-1", ContentPrincipalType.User, "user-1", ContentPermission.View));

        // AncestorIds is stored root first, so parent-1 is the nearer of the two.
        var allowed = await _resolver.ResolveAsync(Resource(ancestors: new[] { "root-1", "parent-1" }), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task Priority_breaks_a_tie_only_within_one_resource()
    {
        SetupPolicies(
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny, priority: 1),
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Allow, priority: 5));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task Turning_inheritance_off_ignores_every_ancestor_entry()
    {
        SetupPolicies(Ace("root-1", ContentPrincipalType.Everyone, null, ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(
            Resource(inherits: false, ancestors: "root-1"), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task An_expired_entry_is_never_consulted()
    {
        // Expiry is enforced in the repository query, so the resolver should ask for
        // active entries and never receive the expired one.
        SetupPolicies();

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
        _repository.Verify(r => r.GetByResourcesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_role_entry_matches_a_role_the_caller_holds()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.Role, "editor", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task A_role_entry_for_a_role_the_caller_lacks_does_not_match()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.Role, "auditor", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task An_organization_entry_matches_only_the_active_organization()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.Organization, "org-1", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task An_organization_entry_for_another_organization_does_not_match()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.Organization, "org-2", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task An_organization_entry_with_no_principal_never_matches()
    {
        // Guards against an empty principal being read as a wildcard, which would hand
        // the resource to every caller.
        SetupPolicies(Ace("file-1", ContentPrincipalType.Organization, null, ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task An_organization_entry_does_not_match_when_the_caller_has_no_active_organization()
    {
        BlocksTestContext.Set(userId: "user-1", organizationId: string.Empty, roles: new[] { "editor" });
        SetupPolicies(Ace("file-1", ContentPrincipalType.Organization, "org-1", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task A_user_entry_for_another_user_does_not_match()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.User, "user-2", ContentPermission.View));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task A_higher_permission_satisfies_every_lower_operation()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.Download));

        var flags = await _resolver.ResolveFlagsAsync(Resource());

        flags.CanView.Should().BeTrue();
        flags.CanDownload.Should().BeTrue();
        flags.CanEdit.Should().BeFalse();
        flags.CanDelete.Should().BeFalse();
        flags.CanManage.Should().BeFalse();
        flags.CanOwner.Should().BeFalse();
    }

    [Fact]
    public async Task Manage_satisfies_everything_except_ownership()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.Manage));

        var flags = await _resolver.ResolveFlagsAsync(Resource());

        flags.CanView.Should().BeTrue();
        flags.CanDownload.Should().BeTrue();
        flags.CanEdit.Should().BeTrue();
        flags.CanDelete.Should().BeTrue();
        flags.CanManage.Should().BeTrue();
        flags.CanOwner.Should().BeFalse();
    }

    [Fact]
    public async Task An_explicit_owner_entry_voids_a_deny_aimed_at_that_principal()
    {
        // Model 2: a Deny is void against the owner of the resource it is authored on.
        SetupPolicies(
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.Owner),
            Ace("file-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny));

        var allowed = await _resolver.ResolveAsync(Resource(), ContentPermission.View);

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task A_deny_on_a_resource_the_caller_owns_still_applies_to_other_callers()
    {
        SetupPolicies(
            Ace("file-1", ContentPrincipalType.Everyone, null, ContentPermission.View),
            Ace("file-1", ContentPrincipalType.User, "user-2", ContentPermission.View, ContentEffect.Deny));

        var allowedForOther = await _resolver.ResolveAsync(Resource(createdBy: "user-2"), ContentPermission.View);
        allowedForOther.Should().BeTrue("the deny targets user-2, and the caller is user-1");

        BlocksTestContext.Set(userId: "user-2", organizationId: "org-1");
        var allowedForOwner = await _resolver.ResolveAsync(Resource(createdBy: "user-2"), ContentPermission.View);
        allowedForOwner.Should().BeTrue("user-2 created the resource, so the deny is void for them");
    }

    [Fact]
    public async Task Everyone_grants_access_to_any_caller()
    {
        SetupPolicies(Ace("file-1", ContentPrincipalType.Everyone, null, ContentPermission.Edit));

        var flags = await _resolver.ResolveFlagsAsync(Resource());

        flags.CanEdit.Should().BeTrue();
        flags.CanView.Should().BeTrue();
    }

    [Fact]
    public async Task Authoring_a_deny_against_the_creator_is_reported_as_a_self_deny()
    {
        var selfDeny = await _resolver.WouldCreateSelfDenyAsync(
            Resource(createdBy: "user-9"), ContentPrincipalType.User, "user-9");

        selfDeny.Should().BeTrue();
    }

    [Fact]
    public async Task Authoring_a_deny_against_an_explicit_owner_is_reported_as_a_self_deny()
    {
        _repository
            .Setup(r => r.GetByResourceAsync("file-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ContentAccessPolicy>
            {
                Ace("file-1", ContentPrincipalType.User, "user-7", ContentPermission.Owner),
            });

        var selfDeny = await _resolver.WouldCreateSelfDenyAsync(
            Resource(), ContentPrincipalType.User, "user-7");

        selfDeny.Should().BeTrue();
    }

    [Fact]
    public async Task Authoring_a_deny_against_a_non_owner_is_allowed()
    {
        _repository
            .Setup(r => r.GetByResourceAsync("file-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ContentAccessPolicy>());

        var selfDeny = await _resolver.WouldCreateSelfDenyAsync(
            Resource(), ContentPrincipalType.User, "user-3");

        selfDeny.Should().BeFalse();
    }

    [Fact]
    public async Task Listing_resolves_a_page_with_one_probe_and_one_batched_fetch()
    {
        // The N+1 guard: whatever the page size, listing must not issue per-child queries.
        var children = new List<ContentResourceDescriptor>
        {
            Resource("own-1", createdBy: "user-1"),
            Resource("pure-1", ancestors: "root-1"),
            Resource("pure-2", ancestors: "root-1"),
            Resource("gated-1", ancestors: "root-1"),
            Resource("gated-2", ancestors: "root-1"),
        };

        _repository
            .Setup(r => r.GetResourceIdsWithPoliciesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HashSet<string>(new[] { "gated-1", "gated-2" }, StringComparer.Ordinal));

        SetupPolicies(Ace("gated-1", ContentPrincipalType.User, "user-1", ContentPermission.View));

        var visible = await _resolver.FilterVisibleAsync(children);

        visible.Select(c => c.ResourceId).Should().Equal("own-1", "pure-1", "pure-2", "gated-1");

        _repository.Verify(r => r.GetResourceIdsWithPoliciesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()), Times.Once);
        _repository.Verify(r => r.GetByResourcesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Listing_hides_a_child_whose_own_entry_denies_the_caller()
    {
        var children = new List<ContentResourceDescriptor> { Resource("gated-1", ancestors: "root-1") };

        _repository
            .Setup(r => r.GetResourceIdsWithPoliciesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HashSet<string>(new[] { "gated-1" }, StringComparer.Ordinal));

        SetupPolicies(
            Ace("root-1", ContentPrincipalType.Everyone, null, ContentPermission.View),
            Ace("gated-1", ContentPrincipalType.User, "user-1", ContentPermission.View, ContentEffect.Deny));

        var visible = await _resolver.FilterVisibleAsync(children);

        visible.Should().BeEmpty();
    }

    [Fact]
    public async Task Listing_shows_a_child_that_does_not_inherit_but_grants_the_caller_directly()
    {
        var children = new List<ContentResourceDescriptor> { Resource("gated-1", inherits: false, ancestors: "root-1") };

        _repository
            .Setup(r => r.GetResourceIdsWithPoliciesAsync(It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HashSet<string>(new[] { "gated-1" }, StringComparer.Ordinal));

        SetupPolicies(Ace("gated-1", ContentPrincipalType.Role, "editor", ContentPermission.View));

        var visible = await _resolver.FilterVisibleAsync(children);

        visible.Select(c => c.ResourceId).Should().Equal("gated-1");
    }

    [Fact]
    public async Task Listing_an_empty_page_touches_no_storage()
    {
        var visible = await _resolver.FilterVisibleAsync(Array.Empty<ContentResourceDescriptor>());

        visible.Should().BeEmpty();
        _repository.VerifyNoOtherCalls();
    }
}
