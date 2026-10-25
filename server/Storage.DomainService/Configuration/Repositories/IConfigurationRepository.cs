using Storage.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DomainService.Configuration
{
    public interface IConfigurationRepository
    {
        Task<StorageConfiguration> GetConfigurationByNameAsync(string configurationName);
        Task<StorageConfiguration?> GetConfigurationByStrategyAsync(string storageStrategy);

        /// <summary>Every document of the old collection (fallback reads and the migration only).</summary>
        Task<List<StorageConfiguration>> GetAllConfigurationsAsync();
    }
}
