using Api.Controllers.DataGateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class DelegatedAdministrationGuardTests : IDisposable
{
    private readonly Mock<ILogger<DelegatedAdministrationGuard>> _logger = new();

    public void Dispose() => ClearContext();

    private DelegatedAdministrationGuard Guard(string? mode)
    {
        var values = new Dictionary<string, string?>();
        if (mode is not null) values[DelegatedAdministrationGuard.ModeKey] = mode;
        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new DelegatedAdministrationGuard(config, Principals(), _logger.Object);
    }

    private void VerifyWarning(string messageStart, Times times) =>
        _logger.Verify(l => l.Log(
            LogLevel.Warning,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((v, _) => v.ToString()!.StartsWith(messageStart)),
            null,
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), times);

    [Theory]
    [InlineData(null)]
    [InlineData("Audit")]
    [InlineData("Enforce")]
    [InlineData("enforce")]
    public void SystemCaller_IsAlwaysAllowed_AndNothingIsLogged(string? mode)
    {
        foreach (var org in new[] { "", "default", "DEFAULT" })
        {
            SetContext(organizationId: org);
            Guard(mode).IsAllowed("policy/create").Should().BeTrue();
        }

        VerifyWarning("DelegatedAdministration", Times.Never());
    }

    [Fact]
    public void RootTenantCaller_IsAllowedInEnforce()
    {
        SetContext(organizationId: "org-1");
        SetBlocksCloud(true);

        Guard("Enforce").IsAllowed("security/change").Should().BeTrue();
    }

    [Fact]
    public void CallWithoutUserContext_IsAllowedInEnforce()
    {
        ClearContext();

        Guard("Enforce").IsAllowed("policy/update").Should().BeTrue();
    }

    [Fact]
    public void UnauthenticatedContext_IsAllowedInEnforce()
    {
        SetContext(organizationId: "org-1", isAuthenticated: false);

        Guard("Enforce").IsAllowed("policy/update").Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Audit")]
    [InlineData("anything-else")]
    public void OrgCaller_InAuditOrDefaultMode_IsAllowedAndWouldDenyIsLogged(string? mode)
    {
        SetContext(userId: "u-9", organizationId: "org-1");

        Guard(mode).IsAllowed("policy/delete").Should().BeTrue();

        VerifyWarning("DelegatedAdministration would deny", Times.Once());
    }

    [Fact]
    public void OrgCaller_InEnforce_IsDenied()
    {
        SetContext(userId: "u-9", organizationId: "org-1");

        Guard("Enforce").IsAllowed("policy/delete").Should().BeFalse();

        VerifyWarning("DelegatedAdministration denied", Times.Once());
        VerifyWarning("DelegatedAdministration would deny", Times.Never());
    }

    [Fact]
    public async Task Controller_Enforce_OrgCaller_Gets403OnEveryWriteAndNothingIsWritten()
    {
        SetContext(organizationId: "org-1");
        var svc = new Mock<IDataAccessService>(MockBehavior.Strict);
        var c = new DataAccessController(svc.Object, Guard("Enforce"));

        var results = new[]
        {
            await c.ConfigureSecurity(new ConfigureSchemaSecurityRequest()),
            await c.CreateDataAccessPolicy(new CreateDataAccessPolicyRequest()),
            await c.UpdateDataAccessPolicy(new UpdateDataAccessPolicyRequest()),
            await c.DeleteDataAccessPolicy("i1"),
        };

        foreach (var r in results)
        {
            var obj = (ObjectResult)r;
            obj.StatusCode.Should().Be(403);
            ((ServiceResponse<ActionResponse>)obj.Value!).Message
                .Should().Be("Access_Grant_Not_Allowed");
        }
    }

    [Fact]
    public async Task Controller_Audit_OrgCaller_StillWrites()
    {
        SetContext(organizationId: "org-1");
        var svc = new Mock<IDataAccessService>();
        svc.Setup(s => s.CreateDataAccessPolicyAsync(It.IsAny<CreateDataAccessPolicyRequest>()))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true }));
        var c = new DataAccessController(svc.Object, Guard("Audit"));

        var r = (ObjectResult)await c.CreateDataAccessPolicy(new CreateDataAccessPolicyRequest());

        r.StatusCode.Should().Be(200);
        svc.Verify(s => s.CreateDataAccessPolicyAsync(It.IsAny<CreateDataAccessPolicyRequest>()), Times.Once);
    }

    [Fact]
    public async Task Controller_Enforce_SystemCaller_Writes()
    {
        SetContext(organizationId: "default");
        var svc = new Mock<IDataAccessService>();
        svc.Setup(s => s.DeleteDataAccessPolicyAsync("i1"))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true }));
        var c = new DataAccessController(svc.Object, Guard("Enforce"));

        var r = (ObjectResult)await c.DeleteDataAccessPolicy("i1");

        r.StatusCode.Should().Be(200);
    }
}
