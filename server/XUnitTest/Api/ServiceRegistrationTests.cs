using System.Diagnostics;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Services;
using DataGateway.Rest;
using DataGateway.Rest.Entities;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace XUnitTest.Api;

/// <summary>
/// The Api host wires the gateway from three registries: the GraphQL-free domain services, the GraphQL transport
/// and the REST transport. Every gateway entry point must resolve from that combined collection.
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
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddKeyValueStore(); // Genesis ApplicationConfigurations.ConfigureServices registers it in the Api host

        services.AddDataGatewayDomainServices();
        services.AddDataGatewayGraphQL();
        services.AddDataGatewayRest(configuration);

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
        provider.GetRequiredService<IEntityModelProvider>().Should().NotBeNull();

        // The REST service is scoped (one per request), so it is resolved from a request-like scope.
        await using var scope = provider.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<IGatewayRestService>().Should().NotBeNull();
    }
}
