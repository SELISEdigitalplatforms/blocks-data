using Blocks.Genesis;
using Blocks.Genesis.Notifications;
using DataGateway.DomainService.Notifications;
using FluentAssertions;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.Notifications;

[Collection("ContextSerial")]
public class BuiltInNotificationSenderTests : IDisposable
{
    private readonly List<NotificationRequest> _published = [];
    private readonly BuiltInNotificationSender _sender;

    public BuiltInNotificationSenderTests()
    {
        var publisher = new Mock<INotificationPublisher>();
        publisher.Setup(p => p.Publish(It.IsAny<NotificationRequest>())).Callback<NotificationRequest>(_published.Add);
        _sender = new BuiltInNotificationSender(publisher.Object);
    }

    public void Dispose() => BlocksTestContext.Clear();

    private static BuiltInNotification Message(IReadOnlyList<string>? users = null, string? organizationId = null, bool includeActor = true) =>
        new("tenant-1", "data-test", users ?? ["user-1"], new { @event = "data-test", title = "t" },
            OrganizationId: organizationId, IncludeImpersonatedActor: includeActor);

    private static void Impersonated(string rootUserId) =>
        BlocksContext.SetContext(BlocksContext.Create(
            tenantId: "tenant-1", roles: null, userId: rootUserId, impersonated: true,
            isAuthenticated: true, requestUri: "https://test", organizationId: "org-1",
            permissions: null, expireOn: DateTime.UtcNow.AddHours(1), email: "a@b.com",
            userName: "root", phoneNumber: null, displayName: "R", oauthToken: null,
            originalTenantId: "root-tenant", impersonationSessionId: null, applicationDomain: "test"));

    [Fact]
    public async Task Send_PublishesNameTenantOrganizationUsersAndResponseKey()
    {
        var ok = await _sender.SendAsync(Message(["user-1", "user-1", " "], "org-7") with { ResponseKey = "k", ResponseValue = "v" });

        ok.Should().BeTrue();
        var request = _published.Should().ContainSingle().Subject;
        request.Name.Should().Be("data-test");
        request.TenantId.Should().Be("tenant-1");
        request.OrganizationId.Should().Be("org-7");
        request.NamedUserIds.Should().Equal("user-1");
        request.ResponseKey.Should().Be("k");
        request.ResponseValue.Should().Be("v");
        request.Payload.Should().NotBeNull();
    }

    [Fact]
    public async Task Send_WithoutOrganization_UsesTheContextOrganization()
    {
        BlocksTestContext.Set(userId: "actor-1", organizationId: "ctx-org", tenantId: "tenant-1");

        await _sender.SendAsync(Message());

        _published.Single().OrganizationId.Should().Be("ctx-org");
    }

    [Fact]
    public async Task Send_ImpersonatedRootUser_IsAddedAsNamedUser_SoConsoleUsersGetIt()
    {
        Impersonated("root-user");

        await _sender.SendAsync(Message());

        _published.Single().NamedUserIds.Should().Equal("user-1", "root-user");
    }

    [Fact]
    public async Task Send_ImpersonatedRootUser_NoticeWhereTheActorMustNotGetIt_DoesNotAddThem()
    {
        Impersonated("root-user");

        await _sender.SendAsync(Message(includeActor: false));

        _published.Single().NamedUserIds.Should().Equal("user-1");
    }

    [Fact]
    public async Task Send_NormalUser_DoesNotAddTheActor()
    {
        BlocksTestContext.Set(userId: "actor-1", organizationId: "org-1", tenantId: "tenant-1");

        await _sender.SendAsync(Message());

        _published.Single().NamedUserIds.Should().Equal("user-1");
    }

    [Fact]
    public async Task Send_WithoutAConfigName_PublishesNothing()
    {
        var ok = await _sender.SendAsync(Message() with { ConfigurationName = " " });

        ok.Should().BeFalse();
        _published.Should().BeEmpty();
    }
}
