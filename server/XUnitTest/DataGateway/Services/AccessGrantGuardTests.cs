using Api.Controllers.DataGateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class AccessGrantGuardTests : IDisposable
{
    private readonly Mock<ILogger<AccessGrantGuard>> _logger = new();

    public void Dispose() => ClearContext();

    private AccessGrantGuard Guard() => new(Principals(), _logger.Object);

    private void VerifyWarning(string messageStart, Times times) =>
        _logger.Verify(l => l.Log(
            LogLevel.Warning,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((v, _) => v.ToString()!.StartsWith(messageStart)),
            null,
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), times);

    [Fact]
    public void SystemCaller_IsAlwaysAllowed_AndNothingIsLogged()
    {
        foreach (var org in new[] { "", "default", "DEFAULT" })
        {
            SetContext(organizationId: org);
            Guard().IsAllowed("policy/create").Should().BeTrue();
        }

        VerifyWarning("AccessGrant", Times.Never());
    }

    [Fact]
    public void ImpersonatedCaller_IsAllowed()
    {
        SetContext(organizationId: "org-1", impersonated: true);

        Guard().IsAllowed("security/change").Should().BeTrue();
    }

    [Fact]
    public void CallWithoutUserContext_IsAllowed()
    {
        ClearContext();

        Guard().IsAllowed("policy/update").Should().BeTrue();
    }

    [Fact]
    public void UnauthenticatedContext_IsAllowed()
    {
        SetContext(organizationId: "org-1", isAuthenticated: false);

        Guard().IsAllowed("policy/update").Should().BeTrue();
    }

    [Fact]
    public void OrgCaller__IsDenied()
    {
        SetContext(userId: "u-9", organizationId: "org-1");

        Guard().IsAllowed("policy/delete").Should().BeFalse();

        VerifyWarning("AccessGrant denied", Times.Once());
    }

    [Fact]
    public async Task Controller_OrgCaller_Gets403OnEveryWriteAndNothingIsWritten()
    {
        SetContext(organizationId: "org-1");
        var svc = new Mock<IDataAccessService>(MockBehavior.Strict);
        var c = new DataAccessController(svc.Object, Guard());

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
    public async Task Controller_SystemCaller_Writes()
    {
        SetContext(organizationId: "default");
        var svc = new Mock<IDataAccessService>();
        svc.Setup(s => s.DeleteDataAccessPolicyAsync("i1"))
            .ReturnsAsync(new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true }));
        var c = new DataAccessController(svc.Object, Guard());

        var r = (ObjectResult)await c.DeleteDataAccessPolicy("i1");

        r.StatusCode.Should().Be(200);
    }
}
