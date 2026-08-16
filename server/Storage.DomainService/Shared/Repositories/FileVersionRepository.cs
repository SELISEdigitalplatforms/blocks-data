using Blocks.Genesis;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public class FileVersionRepository : IFileVersionRepository
    {
        private readonly IDbContextProvider _dbContextProvider;

        public FileVersionRepository(IDbContextProvider dbContextProvider)
        {
           _dbContextProvider = dbContextProvider;
        }

        public async Task CreateFileVersionAsync(FileVersion fileVersion)
        {
            IMongoCollection<FileVersion> entities = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            await entities.InsertOneAsync(fileVersion);
        }

        public async Task DeleteFileVersionsAsync(string fileId)
        {
            var filter = Builders<FileVersion>.Filter.Eq(e => e.FileId, fileId);
            var collection = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            await collection.DeleteManyAsync(filter);
        }

        public IEnumerable<string> GetFileVersionIds(string fileId)
        {
            var filter = Builders<FileVersion>.Filter.Eq(e => e.FileId, fileId);
            var projection = Builders<FileVersion>.Projection.Include(fileVersion => fileVersion.ItemId);
            var collection = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            var fileVersions = collection.Find(filter).Project<FileVersion>(projection).ToEnumerable();
            return fileVersions.Select(fileVersion => fileVersion.ItemId);
        }

        public IEnumerable<FileVersion> GetFileVersions(string fileId)
        {
            var filter = Builders<FileVersion>.Filter.Eq(e => e.FileId, fileId);
            var projection = Builders<FileVersion>.Projection.Include(fileVersion => fileVersion.No).Include(fileVersion => fileVersion.CreatedBy).Include(fileVersion => fileVersion.ItemId);
            var collection = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            return collection.Find(filter).Project<FileVersion>(projection).ToEnumerable();
        }

        public async Task<FileVersion> GetLatestFileVersionIdAsync(string fileId, long versionNumber)
        {
            var filter = Builders<FileVersion>.Filter.Eq(e => e.FileId, fileId) & Builders<FileVersion>.Filter.Eq(e => e.No, versionNumber);
            var collection = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            return await collection.Find(filter).SingleOrDefaultAsync();
        }

        public async Task<long> GetLatestFileVersionNumberAsync(string fileId)
        {
            var updateFilter = Builders<BsonDocument>.Filter.Eq("_id", fileId);
            var update = Builders<BsonDocument>.Update.Inc<long>("CurrentVersion", 1);
            var nextSequence = await _dbContextProvider.GetCollection<BsonDocument>("Files").FindOneAndUpdateAsync(updateFilter, update, new FindOneAndUpdateOptions<BsonDocument> { IsUpsert = false, ReturnDocument = ReturnDocument.After });

            return nextSequence == null ? 0 : nextSequence["CurrentVersion"].AsInt64;
        }
    }
}
