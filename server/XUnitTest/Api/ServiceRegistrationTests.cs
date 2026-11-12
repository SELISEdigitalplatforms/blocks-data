using System.Diagnostics;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.Rest;
using DataGateway.Rest.Entities;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.Api;

/// <summary>
/// The Api host wires the gateway from three registries: the GraphQL-free domain services, the GraphQL transport
/// and the REST transport. Every gateway entry point must resolve from that combined collection.
/// </summary>
[Collection("ContextSerial")] // one test sets the ambient request context
public class ServiceRegistrationTests
{
    /// <summary>Builds the service collection the way <c>Api/Program.cs</c> does, with infrastructure mocked.</summary>
    private static ServiceProvider BuildApiServices(Action<IServiceCollection>? replace = null)
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
        replace?.Invoke(services);

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

    /// <summary>
    /// H7 for REST: the <see cref="IGatewayDataEngine"/> singleton the Api resolves, with <c>DataGateway:MaxPageSize</c>
    /// unset, reads at most 1000 rows.
    /// </summary>
    [Fact]
    public async Task GatewayDataEngine_FromTheApiContainer_CapsAt1000()
    {
        var repository = new Mock<IGqlDbRepository>();
        repository.Setup(r => r.GetItemsAsync(
                It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync([]);
        await using var provider = BuildApiServices(services => services.Replace(ServiceDescriptor.Singleton(repository.Object)));
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var engine = provider.GetRequiredService<IGatewayDataEngine>();
            var schema = Schema(fields: [Field("Name")]);

            var result = await engine.QueryAsync(new EntityModel(schema, null), new QueryCommand("getPersons", null, null, 1, 5000, ["Name"]));

            result.PageSize.Should().Be(1000);
            repository.Verify(r => r.GetItemsAsync(
                "Persons", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(), 0, 1000), Times.Once);
        }
        finally { ClearContext(); }
    }
}
