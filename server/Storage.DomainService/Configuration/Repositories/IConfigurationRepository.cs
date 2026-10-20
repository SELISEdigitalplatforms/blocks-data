using Storage.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DomainService.Configuration
{
    public interface IConfigurationRepository
    {
        Task<StorageConfiguration> GetConfigurationByNameAsync(string configurationName);
        Task<StorageConfiguration?> GetConfigurationByStrategyAsync(string storageStrategy);
    }
}
