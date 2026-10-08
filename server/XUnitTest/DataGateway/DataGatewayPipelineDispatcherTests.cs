using DataGateway.DomainService.GraphQL;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;

namespace XUnitTest.DataGateway;

public class DataGatewayPipelineDispatcherTests
{
    private static DataGatewayPipelineDispatcher Create()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddGraphQLServer();
        return new DataGatewayPipelineDispatcher(services.BuildServiceProvider());
    }

    [Fact]
    public void GetPipeline_ReusesTheSamePipelineForATenant()
    {
        var dispatcher = Create();

        // A reload rebuilds the executor behind the pipeline, never the pipeline itself.
        dispatcher.GetPipeline("tenant-1").Should().BeSameAs(dispatcher.GetPipeline("tenant-1"));
    }

    [Fact]
    public void GetPipeline_BuildsASeparatePipelinePerTenant()
    {
        var dispatcher = Create();

        dispatcher.GetPipeline("tenant-a").Should().NotBeSameAs(dispatcher.GetPipeline("tenant-b"));
    }

    [Fact]
    public void GetPipeline_TreatsTenantIdsCaseSensitively()
    {
        var dispatcher = Create();

        dispatcher.GetPipeline("Tenant").Should().NotBeSameAs(dispatcher.GetPipeline("tenant"));
    }
}
