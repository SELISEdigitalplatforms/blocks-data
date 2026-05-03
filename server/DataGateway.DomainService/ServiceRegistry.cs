using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using HotChocolate.AspNetCore.Serialization;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Execution.Configuration;
using k8s;

namespace DataGateway.DomainService;

public static class ServiceRegistry
{
    public static void AddDataGatewayDomainServices(this IServiceCollection serviceCollection)
    {
        SetServiceTenant();
        serviceCollection.RegisterSchemaServices();
        serviceCollection.RegisterGraphQlServices();
    }

    public static void RegisterSchemaServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<IDbRepository, DbRepository>();
        serviceCollection.AddSingleton<IProjectService, ProjectService>();
        serviceCollection.AddSingleton<ChangeControllerContextAdapter>();

        serviceCollection.AddScoped<IDataSourceService, DataSourceService>();
        serviceCollection.AddScoped<SchemaDefinitionReferenceHelper>();
        serviceCollection.AddScoped<ISchemaDefinitionService, SchemaDefinitionService>();
        serviceCollection.AddScoped<ISchemaChangeLogService, SchemaChangeLogService>();
        serviceCollection.AddScoped<IDataAccessService, DataAccessService>();
        serviceCollection.AddScoped<IDataManageService, DataManageService>();
        serviceCollection.AddScoped<IDataValidationService, DataValidationService>();
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
        serviceCollection.AddSingleton<PipelineRunService>();
        serviceCollection.AddScoped<IDataGatewayDeploymentRepository, DataGatewayDeploymentRepository>();
        serviceCollection.AddScoped<IDataGatewayDeploymentService, DataGatewayDeploymentService>();

        #region Validators
        serviceCollection.AddValidatorsFromAssemblyContaining<CreateSchemaDefinitionRequestValidator>();
        serviceCollection.AddScoped<IRequestValidator, RequestValidator>();
        #endregion

    }
    public static void RegisterGraphQlServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<IConfigurationService, ConfigurationService>();
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
            .DisableIntrospection(false) // Allow introspection for development purposes
            .ConfigureSchemaAsync(ConfigureGraphQLSchemaAsync);
    }

    private static async ValueTask ConfigureGraphQLSchemaAsync(IServiceProvider services, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
    {
        var tenantSlug = string.IsNullOrWhiteSpace(GraphQlConstant.TenantSlug)
            ? RequestContextAccessor.Current.TenantSlug
            : GraphQlConstant.TenantSlug;
        Console.WriteLine($"Tenant Slug from service: {tenantSlug}");
        var tenantId = GraphQlConstant.TenantId ?? string.Empty;
        Console.WriteLine($"Tenant ID from service: {tenantId}");
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            var projectService = services.GetRequiredService<IProjectService>();
            tenantId = string.IsNullOrWhiteSpace(tenantSlug)
                        ? RequestContextAccessor.Current.BlocksKey
                        : await projectService.GetTenantIdAsync(tenantSlug);
        }


        Console.WriteLine($"Tenant ID: {tenantId}");
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            Console.WriteLine("Tenant ID is empty, skipping schema configuration");
            return;
        }
        GraphQlConstant.SetTenantInformation(tenantId, tenantSlug);
        var provider = services.GetRequiredService<IConfigurationService>();
        await provider.ConfigureSchemaAsync(tenantSlug, schemaBuilder, cancellationToken);
    }

    private static void SetServiceTenant()
    {
        var tenantSlug = Environment.GetEnvironmentVariable("TENANT_SLUG") ?? string.Empty;
        Console.WriteLine($"Tenant Slug from environment: {tenantSlug}");
        var tenantId = Environment.GetEnvironmentVariable("TENANT_ID") ?? string.Empty;
        Console.WriteLine($"Tenant ID from environment: {tenantId}");

        GraphQlConstant.SetTenantInformation(tenantId, tenantSlug);
    }

}