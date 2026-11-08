using DataGateway.Rest.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DataGateway.Rest;

/// <summary>
/// Registers the REST API: the service, the entity model provider (a singleton, it owns the model cache) and their
/// settings. Settings are checked when the host starts, so a bad value stops the start instead of failing requests.
/// Needs the domain services (engine, stores, policy resolver) registered as well.
/// </summary>
public static class RestServiceRegistry
{
    public static IServiceCollection AddDataGatewayRest(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddOptions<RestLimits>()
            .Bind(configuration.GetSection(RestLimits.SectionName))
            .Validate(limits => limits.MaxPageSize > 0, $"{RestLimits.SectionName}:{nameof(RestLimits.MaxPageSize)} must be positive.")
            .Validate(limits => limits.DefaultPageSize > 0 && limits.DefaultPageSize <= limits.MaxPageSize,
                $"{RestLimits.SectionName}:{nameof(RestLimits.DefaultPageSize)} must be positive and at most {nameof(RestLimits.MaxPageSize)}.")
            .Validate(limits => limits.MaxBulkItems > 0, $"{RestLimits.SectionName}:{nameof(RestLimits.MaxBulkItems)} must be positive.")
            .Validate(limits => limits.MaxRequestBodyBytes > 0, $"{RestLimits.SectionName}:{nameof(RestLimits.MaxRequestBodyBytes)} must be positive.")
            .Validate(limits => limits.MaxWhereDepth > 0, $"{RestLimits.SectionName}:{nameof(RestLimits.MaxWhereDepth)} must be positive.")
            .Validate(limits => limits.MaxWhereConditions > 0, $"{RestLimits.SectionName}:{nameof(RestLimits.MaxWhereConditions)} must be positive.")
            .ValidateOnStart();

        services.AddOptions<EntityViewCacheOptions>()
            .Bind(configuration.GetSection(EntityViewCacheOptions.SectionName))
            .Validate(cache => cache.MaxEntries > 0, $"{EntityViewCacheOptions.SectionName}:{nameof(EntityViewCacheOptions.MaxEntries)} must be positive.")
            .Validate(cache => cache.SlidingExpirationMinutes > 0,
                $"{EntityViewCacheOptions.SectionName}:{nameof(EntityViewCacheOptions.SlidingExpirationMinutes)} must be positive.")
            .ValidateOnStart();

        services.AddSingleton<IEntityModelProvider, EntityModelProvider>();
        services.AddScoped<IGatewayRestService, GatewayRestService>();
        return services;
    }
}
