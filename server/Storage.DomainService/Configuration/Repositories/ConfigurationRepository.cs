using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using System.Diagnostics.CodeAnalysis;


namespace DomainService.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ConfigurationRepository : IConfigurationRepository
    {
        private readonly IDbContextProvider _dbContextProvider;
        private const string _collectionName = "StorageConfigurations";

        public ConfigurationRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        public async Task<StorageConfiguration> GetConfigurationByNameAsync(string configurationName)
        {
            var collection = _dbContextProvider.GetCollection<StorageConfiguration>(_collectionName);

            var filter = Builders<StorageConfiguration>.Filter.Eq(mc => mc.Name, configurationName);
            return await collection.Find(filter).FirstOrDefaultAsync();
        }

        public async Task<StorageConfiguration?> GetConfigurationByStrategyAsync(string storageStrategy)
        {
            var collection = _dbContextProvider.GetCollection<StorageConfiguration>(_collectionName);

            var filter = Builders<StorageConfiguration>.Filter.Eq(mc => mc.StorageStrategy, storageStrategy);
            return await collection.Find(filter).FirstOrDefaultAsync();
        }
    }
}
