using Blocks.Genesis;
using MongoDB.Driver;
using System.Diagnostics.CodeAnalysis;
using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services
{
    [ExcludeFromCodeCoverage]
    public class DirectoryRepository : IDirectoryRepository
    {
        private readonly IDbContextProvider _dbContextProvider;

        public DirectoryRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        public async Task CreateDirectoryAsync(Directory directory)
        {
            var entities = _dbContextProvider.GetCollection<Directory>(string.Format("{0}s", typeof(Directory).Name));
            await entities.InsertOneAsync(directory);
        }

        public async Task UpdateDirectory(Directory directory)
        {
            var filter = Builders<Directory>.Filter.Eq(e => e.ItemId, directory.ItemId);
            var collection = _dbContextProvider.GetCollection<Directory>(string.Format("{0}s", typeof(Directory).Name));
            await collection.ReplaceOneAsync(filter, directory, new ReplaceOptions { IsUpsert = true });
        }

        public async Task<List<Directory>> GetDirectories(string directoryId)
        {
            var filter = Builders<Directory>.Filter.Eq(e => e.ParentDirectoryID, directoryId);
            var collection = _dbContextProvider.GetCollection<Directory>(string.Format("{0}s", typeof(Directory).Name));
            var directories = collection.Find(filter);
            return await directories.ToListAsync();
        }

        public async Task<Directory> GetDirectoryByItemIDAsync(string itemID)
        {
            FilterDefinition<Directory> filter = Builders<Directory>.Filter.Eq("_id", itemID);
            var collection = _dbContextProvider.GetCollection<Directory>(string.Format("{0}s", typeof(Directory).Name));
            return await collection.Find(filter).SingleOrDefaultAsync();
        }
    }
}
