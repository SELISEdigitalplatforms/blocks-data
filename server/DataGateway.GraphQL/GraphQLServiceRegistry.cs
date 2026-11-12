using Blocks.Genesis;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using HotChocolate.AspNetCore.Serialization;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService;

/// <summary>
/// Registers the GraphQL (HotChocolate) transport over the gateway. Call after
/// <see cref="ServiceRegistry.AddDataGatewayDomainServices"/>. Deleted with this project when GraphQL is retired.
/// </summary>
public static class GraphQLServiceRegistry
{
    public static IServiceCollection AddDataGatewayGraphQL(this IServiceCollection services)
    {
        // Checked when the host starts (binding included, so an unparseable date fails there), not per request.
        services.AddOptions<GraphQLDeprecationOptions>()
            .Configure<IConfiguration>((options, configuration) =>
                configuration.GetSection(GraphQLDeprecationOptions.SectionName).Bind(options))
            .Validate(
                options => options.DeprecatedSince is not { } since || options.SunsetDate is not { } sunset || sunset > since,
                $"{GraphQLDeprecationOptions.SectionName}:{nameof(GraphQLDeprecationOptions.SunsetDate)} must be after " +
                $"{GraphQLDeprecationOptions.SectionName}:{nameof(GraphQLDeprecationOptions.DeprecatedSince)}.")
            .Validate(
                options => options.MigrationGuideUrl is null || GraphQLDeprecationOptions.IsHttpUrl(options.MigrationGuideUrl),
                $"{GraphQLDeprecationOptions.SectionName}:{nameof(GraphQLDeprecationOptions.MigrationGuideUrl)} must be an absolute http or https URL.")
            .ValidateOnStart();
        services.AddSingleton<ISchemaConfigurationService, SchemaConfigurationService>();
        services.AddSingleton<GraphqlSchemaBuilder>();
        services.AddSingleton<IPublishedSchemaValidator, GraphQLPublishedSchemaValidator>();
        services.AddSingleton<IQueryService, QueryService>();
        services.AddSingleton<IMutationService, MutationService>();
        services.AddSingleton<SchemaResolver>();
        services.AddSingleton<BuiltSchemaVersions>();
        services.AddSingleton<ITenantSchemaConfigurator, TenantSchemaConfigurator>();
        services.AddSingleton(sp => new SchemaVersionTracker(
            sp.GetRequiredService<ISchemaVersionStore>(),
            sp.GetRequiredService<BuiltSchemaVersions>(),
            sp,
            sp.GetRequiredService<IConfiguration>(),
            sp.GetRequiredService<ILogger<SchemaVersionTracker>>()));
        services.AddHostedService(sp => new SchemaPublishSubscriber(
            sp.GetRequiredService<ICacheClient>(),
            sp.GetRequiredService<SchemaVersionTracker>(),
            sp.GetRequiredService<ILogger<SchemaPublishSubscriber>>()));
        services.AddGraphQLServers();
        return services;
    }

    private static void AddGraphQLServers(this IServiceCollection serviceCollection)
    {
        serviceCollection.AddHttpResponseFormatter<AuthHttpResponseFormatter>();
        // Do not call DisableIntrospection() or AddValidationRule() here: they configure only this
        // template executor, which serves no traffic. Per-tenant validation lives in AddGatewayValidation.
        serviceCollection.AddGraphQLServer()
            .ModifyCostOptions(options =>
            {
                options.MaxFieldCost = 3000;
                options.MaxTypeCost = 3000;
            })
            .AddGatewayValidation()
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
