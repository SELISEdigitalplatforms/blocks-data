using FluentValidation;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using Microsoft.Extensions.DependencyInjection;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using k8s;

namespace DataGateway.DomainService;

public static class ServiceRegistry
{
    public static void AddDataGatewayDomainServices(this IServiceCollection serviceCollection)
    {
        SetServiceTenant();
        serviceCollection.RegisterSchemaServices();
        serviceCollection.RegisterCoreGatewayServices();
    }

    public static void RegisterSchemaServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<IDbRepository, DbRepository>();
        serviceCollection.AddSingleton<IProjectService, ProjectService>();

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

    private static void RegisterCoreGatewayServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<IConfigurationService, ConfigurationService>();
        serviceCollection.AddSingleton<IDataChangeEventPublisher, DataChangeEventPublisher>();
    }

    public static void RegisterRestGatewayServices(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddSingleton<ISchemaDefinitionRegistry, SchemaDefinitionRegistry>();
        serviceCollection.AddSingleton<IGatewayQueryService, GatewayQueryService>();
        serviceCollection.AddSingleton<IGatewayMutationService, GatewayMutationService>();
        serviceCollection.AddSingleton<RestAccessControlService>();
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
