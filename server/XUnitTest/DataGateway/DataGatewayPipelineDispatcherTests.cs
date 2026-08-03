using DataGateway.DomainService.GraphQL;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;

namespace XUnitTest.DataGateway;

public class DataGatewayPipelineDispatcherTests
{
    private static DataGatewayPipelineDispatcher Create() =>
        new(new ServiceCollection().BuildServiceProvider());

    [Fact]
    public void BumpVersionAndClearPipeline_ReturnsTheUnstampedNameOnTheFirstReload()
    {
        var dispatcher = Create();

        // The very first bump retires version 0, which is the bare tenant id.
        dispatcher.BumpVersionAndClearPipeline("tenant-1").Should().Be("tenant-1");
    }

    [Fact]
    public void BumpVersionAndClearPipeline_StampsSubsequentReloadsWithTheRetiredVersion()
    {
        var dispatcher = Create();

        dispatcher.BumpVersionAndClearPipeline("tenant-1").Should().Be("tenant-1");
        dispatcher.BumpVersionAndClearPipeline("tenant-1").Should().Be("tenant-1__v1");
        dispatcher.BumpVersionAndClearPipeline("tenant-1").Should().Be("tenant-1__v2");
    }

    [Fact]
    public void BumpVersionAndClearPipeline_VersionsEachTenantIndependently()
    {
        var dispatcher = Create();

        dispatcher.BumpVersionAndClearPipeline("tenant-a");
        dispatcher.BumpVersionAndClearPipeline("tenant-a");

        dispatcher.BumpVersionAndClearPipeline("tenant-b").Should().Be("tenant-b");
        dispatcher.BumpVersionAndClearPipeline("tenant-a").Should().Be("tenant-a__v2");
    }

    [Fact]
    public void BumpVersionAndClearPipeline_TreatsTenantIdsCaseSensitively()
    {
        var dispatcher = Create();

        dispatcher.BumpVersionAndClearPipeline("Tenant").Should().Be("Tenant");
        dispatcher.BumpVersionAndClearPipeline("tenant").Should().Be("tenant");
    }
}
