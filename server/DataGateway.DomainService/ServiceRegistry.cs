using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
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
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.DependencyInjection.Extensions;
using k8s;

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
        serviceCollection.AddSingleton<ISchemaImportService, SchemaImportService>();
        serviceCollection.AddSingleton<IGqlDbRepository, GqlDbRepository>();

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
        serviceCollection.AddSingleton<IQueryService, QueryService>();
        serviceCollection.AddSingleton<IMutationService, MutationService>();
        serviceCollection.AddSingleton<SchemaResolver>();
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
            .ConfigureSchemaAsync(ConfigureGraphQLSchemaAsync)
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

    private static async ValueTask ConfigureGraphQLSchemaAsync(IServiceProvider services, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        Console.WriteLine("Configuring GraphQL schema for tenant");
        // Skip schema configuration when HttpContext is unavailable.
        var httpContext = RequestContextAccessor.Current.HttpContext;
        if (httpContext == null)
        {
            Console.WriteLine("ConfigureGraphQLSchemaAsync: HttpContext is null, skipping schema configuration");
            return;
        }

        // HttpContext may already be disposed on late pipeline stages.
        try
        {
            Console.WriteLine($"ConfigureGraphQLSchemaAsync: HttpContext is available, request path: {httpContext.Request.Path}");
            _ = httpContext.RequestAborted;
        }
        catch (ObjectDisposedException)
        {
            Console.WriteLine("ConfigureGraphQLSchemaAsync: HttpContext is disposed, skipping schema configuration");
            return;
        }

        var tenantId = TenantContext.GetTenantId();
        Console.WriteLine($"Configuring schema for tenant id: {tenantId}");

        if (string.IsNullOrWhiteSpace(tenantId))
        {
            Console.WriteLine("Tenant ID is empty, skipping schema configuration");
            return;
        }

        var schemaBuilderService = services.GetRequiredService<GraphqlSchemaBuilder>();
        await schemaBuilderService.BuildSchema(tenantId, schemaBuilder, cancellationToken);
    }
}
