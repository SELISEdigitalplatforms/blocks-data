using System.Diagnostics;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace XUnitTest.Api;

/// <summary>
/// The Api host wires the gateway from two registries: the GraphQL-free domain services and the GraphQL
/// transport. Every gateway entry point must resolve from that combined collection.
/// </summary>
public class ServiceRegistrationTests
{
    /// <summary>Builds the service collection the way <c>Api/Program.cs</c> does, with infrastructure mocked.</summary>
    private static ServiceProvider BuildApiServices()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Mock.Of<IDbContextProvider>());
        services.AddSingleton(Mock.Of<ICacheClient>());
        services.AddSingleton(Mock.Of<IBlocksSecret>());
        services.AddSingleton(Mock.Of<ITenants>());
        services.AddSingleton(Mock.Of<ICloudBuildSecret>());
        services.AddSingleton(Mock.Of<IMessageClient>());
        services.AddSingleton(new ActivitySource("service-registration-test"));
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddKeyValueStore(); // Genesis ApplicationConfigurations.ConfigureServices registers it in the Api host

        services.AddDataGatewayDomainServices();
        services.AddDataGatewayGraphQL();

        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
    }

    [Fact]
    public async Task AllGatewayServicesResolve()
    {
        // HotChocolate's executor resolver is only IAsyncDisposable, so the container is disposed asynchronously.
        await using var provider = BuildApiServices();

        provider.GetRequiredService<IGatewayDataEngine>().Should().BeOfType<MongoGatewayDataEngine>();
        provider.GetRequiredService<IQueryService>().Should().NotBeNull();
        provider.GetRequiredService<IMutationService>().Should().NotBeNull();
        provider.GetRequiredService<ISchemaPublishService>().Should().NotBeNull();
        provider.GetRequiredService<ISchemaConfigurationService>().Should().NotBeNull();
        provider.GetRequiredService<DataGatewayPipelineDispatcher>().Should().NotBeNull();
    }
}
