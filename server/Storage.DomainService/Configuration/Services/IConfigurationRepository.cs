using Storage.DomainService.Entities;

namespace DomainService.Configuration
{
    public interface IConfigurationRepository
    {
        Task<StorageConfiguration> GetConfigurationByNameAsync(string configurationName);
        Task<StorageConfiguration?> GetConfigurationByStrategyAsync(string storageStrategy);
    }
}
