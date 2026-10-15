using FluentValidation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Services.RegexAssistant;
using DataGateway.DomainService.Validators;
using HotChocolate.AspNetCore.Serialization;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.DependencyInjection.Extensions;
using k8s;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Policies;

namespace DataGateway.DomainService;

public static class ServiceRegistry
{
    public static void AddDataGatewayDomainServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.RegisterSchemaServices();
        serviceCollection.RegisterGraphQlServices();
    }

    public static void RegisterSchemaServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<IDbRepository, DbRepository>();
        serviceCollection.AddSingleton<IProjectService, ProjectService>();
        serviceCollection.AddSingleton<DataGatewayTokenAuthenticator>();

        serviceCollection.AddScoped<IDataGatewayConfigurationService, DataGatewayConfigurationService>();
        serviceCollection.AddScoped<SchemaDefinitionReferenceHelper>();
        serviceCollection.AddScoped<ISchemaDefinitionService, SchemaDefinitionService>();
        serviceCollection.AddScoped<ISchemaIndexService, SchemaIndexService>();
        serviceCollection.AddScoped<ISchemaChangeLogService, SchemaChangeLogService>();
        serviceCollection.AddScoped<IDataAccessService, DataAccessService>();
        serviceCollection.AddScoped<IMockDataService, MockDataService>();
        serviceCollection.AddScoped<IDataValidationService, DataValidationService>();
        serviceCollection.AddScoped<IGraphLogHistoryService, GraphLogHistoryService>();
        serviceCollection.AddHttpClient<IRegexAssistantService, RegexAssistantService>();
        serviceCollection.AddSingleton<ISchemaExportService, SchemaExportService>();
        serviceCollection.AddSingleton<SchemaImportValidator>();
        serviceCollection.AddSingleton<ISchemaImportService, SchemaImportService>();
        serviceCollection.AddSingleton<IGqlDbRepository, GqlDbRepository>();

        // Data-source secrets (data SPEC1 §3.5.1): Blocks Secrets (scoped services), a singleton resolver
        // (new scope per call, no value cache) and the BYO client cache (secret read only on a miss).
        serviceCollection.AddBlocksSecrets();
        serviceCollection.TryAddSingleton<IDataSourceSecretResolver, DataSourceSecretResolver>();
        serviceCollection.TryAddSingleton<IDataSourceConfigStore, DataSourceConfigStore>();
        serviceCollection.TryAddSingleton<IDataSourceClientFactory, DataSourceClientFactory>();
        serviceCollection.TryAddSingleton<IClusterRegistry, DriverClusterRegistry>();
        serviceCollection.TryAddSingleton<DataSourceClientCache>(sp => new DataSourceClientCache(
            sp.GetRequiredService<IDataSourceSecretResolver>(),
            sp.GetRequiredService<IDataSourceClientFactory>(),
            sp.GetRequiredService<IClusterRegistry>(),
            sp.GetRequiredService<ILogger<DataSourceClientCache>>()));
        serviceCollection.TryAddSingleton<IDataSourceClientCache>(sp => sp.GetRequiredService<DataSourceClientCache>());

        serviceCollection.AddSingleton<IKubernetes>(_ =>
        {
            KubernetesClientConfiguration config;
            try
            {
                config = KubernetesClientConfiguration.InClusterConfig();
            }
            catch (k8s.Exceptions.KubeConfigException)
            {
                config = KubernetesClientConfiguration.BuildConfigFromConfigFile();
            }
            return new Kubernetes(config);
        });

        #region Validators
        serviceCollection.AddValidatorsFromAssemblyContaining<CreateSchemaDefinitionRequestValidator>();
        serviceCollection.AddScoped<IRequestValidator, RequestValidator>();
        #endregion

    }
    public static void RegisterGraphQlServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<ISchemaConfigurationService, SchemaConfigurationService>();
        serviceCollection.AddSingleton<IGqlDbRepository, GqlDbRepository>();
        serviceCollection.AddSingleton<GraphqlSchemaBuilder>();
        serviceCollection.AddSingleton<IDataChangeEventPublisher, DataChangeEventPublisher>();
        serviceCollection.AddBlocksDataAccess();
        serviceCollection.AddSingleton<IAccessPrincipalAccessor, BlocksContextPrincipalAccessor>();
        serviceCollection.AddSingleton<IQueryService, QueryService>();
        serviceCollection.AddSingleton<IMutationService, MutationService>();
        serviceCollection.AddSingleton<SchemaResolver>();
        serviceCollection.AddSingleton<ISchemaVersionStore, SchemaVersionStore>();
        serviceCollection.AddSingleton<ISchemaSnapshotStore>(sp => new SchemaSnapshotStore(sp.GetRequiredService<IDbRepository>()));
        serviceCollection.AddSingleton<ISchemaPublishService, SchemaPublishService>();
        serviceCollection.AddSingleton<BuiltSchemaVersions>();
        serviceCollection.AddSingleton<ITenantSchemaConfigurator, TenantSchemaConfigurator>();
        serviceCollection.AddSingleton(sp => new SchemaVersionTracker(
            sp.GetRequiredService<ISchemaVersionStore>(),
            sp.GetRequiredService<BuiltSchemaVersions>(),
            sp,
            sp.GetRequiredService<IConfiguration>(),
            sp.GetRequiredService<ILogger<SchemaVersionTracker>>()));
        serviceCollection.AddHostedService(sp => new SchemaPublishSubscriber(
            sp.GetRequiredService<ICacheClient>(),
            sp.GetRequiredService<SchemaVersionTracker>(),
            sp.GetRequiredService<ILogger<SchemaPublishSubscriber>>()));
        serviceCollection.AddGraphQLServers();

    }
    private static void AddGraphQLServers(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddHttpResponseFormatter<AuthHttpResponseFormatter>();
        serviceCollection.AddGraphQLServer()
            .DisableIntrospection()
            .ModifyCostOptions(options =>
            {
                options.MaxFieldCost = 3000;
                options.MaxTypeCost = 3000;
            })
            .AddValidationRule((_, _) => new MaxRootFieldsRule(GraphQlConstant.MaxRootFieldsPerOperation))
            // Each tenant's schema is added per schema name by ProjectExecutorOptionsMonitor.
            //
            // Rides HotChocolate's own instrumentation hook (already part of its implicit default
            // pipeline) instead of a custom request middleware, so nothing about the pipeline
            // itself needs to be touched or rebuilt.
            .AddDiagnosticEventListener<GatewayActivityDiagnosticEventListener>();

        // A separate GraphQL schema/executor is served per tenant (identified by the x-blocks-key
        // header). Replace the executor options monitor so an executor can be resolved for any tenant
        // id at runtime, and register the dispatcher that routes requests to the right one.
        serviceCollection.RemoveAll<IRequestExecutorOptionsMonitor>();
        serviceCollection.AddSingleton<ProjectExecutorOptionsMonitor>();
        serviceCollection.AddSingleton<IRequestExecutorOptionsMonitor>(sp =>
            sp.GetRequiredService<ProjectExecutorOptionsMonitor>());
        serviceCollection.AddSingleton<DataGatewayPipelineDispatcher>();
    }
}
