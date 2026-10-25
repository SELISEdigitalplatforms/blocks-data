using Blocks.Genesis;
using Blocks.Secrets;
using DomainService.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Blocks.Extension.DependencyInjection
{
    public static class StorageConfigurationServiceCollectionExtensions
    {
        /// <summary>
        /// Registers the storage configuration reader (<see cref="IStorageConfigurationProvider"/>) and writer
        /// (<see cref="IStorageConfigurationStore"/>) with what they need: Blocks Secrets (scoped), the Genesis key-value
        /// store and the old-collection fallback. Safe to call more than once. Called by
        /// <c>RegisterBlocksStorageServices</c>; hosts that only need the configuration (blocks-os API) can call it alone.
        /// </summary>
        public static IServiceCollection AddBlocksStorageConfiguration(this IServiceCollection services)
        {
            ArgumentNullException.ThrowIfNull(services);

            services.AddBlocksSecrets();
            services.TryAddSingleton<IKeyValueStore, MongoKeyValueStore>();
            services.TryAddSingleton<IConfigurationRepository, ConfigurationRepository>();
            services.TryAddSingleton<IStorageSecretAccessor, StorageSecretAccessor>();
            services.TryAddSingleton<IStorageConfigurationProvider, StorageConfigurationProvider>();
            services.TryAddSingleton<IStorageConfigurationStore, StorageConfigurationStore>();
            return services;
        }
    }
}
