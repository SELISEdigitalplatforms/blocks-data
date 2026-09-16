using Blocks.Genesis;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public class FileVersionRepository : IFileVersionRepository
    {
        private readonly IDbContextProvider _dbContextProvider;

        public FileVersionRepository(IDbContextProvider dbContextProvider)
        {
           _dbContextProvider = dbContextProvider;
        }

        private IMongoCollection<FileVersion> GetVersionsCollection() =>
            _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));

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
            var projection = Builders<FileVersion>.Projection
                .Include(fileVersion => fileVersion.No)
                .Include(fileVersion => fileVersion.CreatedBy)
                .Include(fileVersion => fileVersion.ItemId)
                .Include(fileVersion => fileVersion.FileVerificationStatus);
            var collection = _dbContextProvider.GetCollection<FileVersion>(string.Format("{0}s", typeof(FileVersion).Name));
            return collection.Find(filter).Project<FileVersion>(projection).ToEnumerable();
        }

        public async Task<long> GetLatestFileVersionNumberAsync(string fileId)
        {
            var updateFilter = Builders<BsonDocument>.Filter.Eq("_id", fileId);
            var update = Builders<BsonDocument>.Update.Inc<long>("CurrentVersion", 1);
            var nextSequence = await _dbContextProvider.GetCollection<BsonDocument>("Files").FindOneAndUpdateAsync(updateFilter, update, new FindOneAndUpdateOptions<BsonDocument> { IsUpsert = false, ReturnDocument = ReturnDocument.After });

            return nextSequence == null ? 0 : nextSequence["CurrentVersion"].AsInt64;
        }

        public async Task<FileVersion?> GetFileVersionAsync(string fileId, string fileVersionId)
        {
            var filter = Builders<FileVersion>.Filter.And(
                Builders<FileVersion>.Filter.Eq(v => v.FileId, fileId),
                Builders<FileVersion>.Filter.Eq(v => v.ItemId, fileVersionId));

            return await GetVersionsCollection().Find(filter).FirstOrDefaultAsync();
        }

        public async Task<FileVersion?> TryClaimCompletionAsync(string fileId, string fileVersionId, TimeSpan leaseDuration)
        {
            var now = DateTime.UtcNow;

            // Only a version that is currently Quarantined and not under an unexpired claim can be
            // claimed. A crash leaves CompletionClaimedUntilUtc in the past, so the lease simply expires
            // and the next completion attempt can claim it again.
            var filter = Builders<FileVersion>.Filter.And(
                Builders<FileVersion>.Filter.Eq(v => v.FileId, fileId),
                Builders<FileVersion>.Filter.Eq(v => v.ItemId, fileVersionId),
                Builders<FileVersion>.Filter.Eq(v => v.FileVerificationStatus, FileVerificationStatus.Quarantined),
                Builders<FileVersion>.Filter.Or(
                    Builders<FileVersion>.Filter.Eq(v => v.CompletionClaimedUntilUtc, null),
                    Builders<FileVersion>.Filter.Lt(v => v.CompletionClaimedUntilUtc, now)));

            var update = Builders<FileVersion>.Update.Set(v => v.CompletionClaimedUntilUtc, now.Add(leaseDuration));

            return await GetVersionsCollection().FindOneAndUpdateAsync(
                filter, update, new FindOneAndUpdateOptions<FileVersion> { IsUpsert = false, ReturnDocument = ReturnDocument.After });
        }

        public async Task<bool> CompleteVerificationAsync(
            string fileId, string fileVersionId, FileVerificationStatus finalStatus, string? finalStorageKey, string? rejectionReason)
        {
            var filter = Builders<FileVersion>.Filter.And(
                Builders<FileVersion>.Filter.Eq(v => v.FileId, fileId),
                Builders<FileVersion>.Filter.Eq(v => v.ItemId, fileVersionId));

            var update = Builders<FileVersion>.Update
                .Set(v => v.FileVerificationStatus, finalStatus)
                .Set(v => v.RejectionReason, rejectionReason)
                // Release the claim regardless of outcome: a Verified/Rejected version is never claimed
                // again (TryClaimCompletionAsync only matches Quarantined), so a stale lease timestamp
                // left behind would be pure clutter.
                .Set(v => v.CompletionClaimedUntilUtc, null);

            if (finalStorageKey != null)
            {
                update = update.Set(v => v.StorageKey, finalStorageKey);
            }

            var result = await GetVersionsCollection().UpdateOneAsync(filter, update);
            return result.ModifiedCount > 0;
        }
    }
}
