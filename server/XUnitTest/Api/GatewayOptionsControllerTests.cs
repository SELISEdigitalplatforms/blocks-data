using System.Text.Json;
using DataGateway.Api.Controllers;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.Api;

public class GatewayOptionsControllerTests
{
    [Fact]
    public async Task ReadsOnlyTheCallersOptionsWithoutConnectionFields()
    {
        BlocksTestContext.Set(userId: "admin", tenantId: "tenant-a");
        var store = new Mock<IDataSourceConfigStore>(MockBehavior.Strict);
        store.Setup(s => s.GetRootAsync("tenant-a", false)).ReturnsAsync(new DataServiceConfiguration
        {
            DbConnectionSecretId = "private-secret-id",
            DatabaseName = "private-database",
            CollectionNamePattern = "custom_{SchemaName}",
            IsCollectionNameEditable = true,
            AnalyticsConfiguration = new AnalyticsConfiguration { EnableAnalytics = true }
        });
        var controller = new GatewayOptionsController(new DataGatewayConfigurationService(store.Object));

        var result = (await controller.GetAsync()).Should().BeOfType<OkObjectResult>().Subject;
        var options = result.Value.Should().BeOfType<GatewayOptions>().Subject;
        options.CollectionNamePattern.Should().Be("custom_{SchemaName}");
        options.IsCollectionNameEditable.Should().BeTrue();
        options.AnalyticsConfiguration!.EnableAnalytics.Should().BeTrue();
        var fields = JsonSerializer.SerializeToElement(options).EnumerateObject().Select(p => p.Name);
        fields.Should().BeEquivalentTo("IsCollectionNameEditable", "CollectionNamePattern", "AnalyticsConfiguration");
        store.VerifyAll();
        store.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task MissingRootReturnsNotFoundWithoutCreatingAnything()
    {
        BlocksTestContext.Set(userId: "admin", tenantId: "missing-tenant");
        var store = new Mock<IDataSourceConfigStore>(MockBehavior.Strict);
        store.Setup(s => s.GetRootAsync("missing-tenant", false)).ReturnsAsync((DataServiceConfiguration?)null);
        var controller = new GatewayOptionsController(new DataGatewayConfigurationService(store.Object));

        (await controller.GetAsync()).Should().BeOfType<NotFoundResult>();
        store.VerifyAll();
        store.VerifyNoOtherCalls();
    }
}
