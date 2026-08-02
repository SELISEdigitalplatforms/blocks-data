using Blocks.Genesis;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;
using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services
{
    [ExcludeFromCodeCoverage]
    public class DirectoryRepository : IDirectoryRepository
    {
        // The live collection is "Directories" (the storage services and every test insert into
        // this name). The generic convention "typeof(T).Name + 's'" would yield "Directorys"
        // for this entity, so the listing methods use the actual collection name directly.
        private const string CollectionName = "Directories";

        private readonly IDbContextProvider _dbContextProvider;

        public DirectoryRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        public async Task CreateDirectoryAsync(Directory directory)
        {
            var entities = _dbContextProvider.GetCollection<Directory>(CollectionName);
            await entities.InsertOneAsync(directory);
        }

        public async Task CreateDirectoriesAsync(List<Directory> directories)
        {
            if (directories.Count == 0) return;
            var entities = _dbContextProvider.GetCollection<Directory>(CollectionName);
            await entities.InsertManyAsync(directories);
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

        public async Task<Directory?> FindByIdAsync(string folderId, bool includeArchived, CancellationToken cancellationToken = default)
        {
            var b = Builders<Directory>.Filter;
            var filter = b.Eq(d => d.ItemId, folderId);

            if (!includeArchived)
            {
                filter &= b.Eq(d => d.IsArchived, false);
            }

            var collection = _dbContextProvider.GetCollection<Directory>(CollectionName);
            return await (await collection.FindAsync(filter, cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<List<Directory>> FindChildrenAsync(
            string parentId,
            string? afterName,
            string? afterId,
            int take,
            string? search,
            CancellationToken cancellationToken = default)
        {
            var filter = BuildChildFilter(parentId, search);

            if (!string.IsNullOrEmpty(afterName) && !string.IsNullOrEmpty(afterId))
            {
                // Keyset predicate for an (Name, ItemId) sort: strictly greater by name, or equal
                // by name and strictly greater by id. A plain "name > after" would drop every
                // sibling that shares the page boundary's name.
                var b = Builders<Directory>.Filter;
                filter &= b.Gt(d => d.Name, afterName)
                         | (b.Eq(d => d.Name, afterName) & b.Gt(d => d.ItemId, afterId));
            }

            var collection = _dbContextProvider.GetCollection<Directory>(CollectionName);
            return await collection.Find(filter)
                .SortBy(d => d.Name).ThenBy(d => d.ItemId)
                .Limit(take)
                .ToListAsync(cancellationToken);
        }

        public async Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default)
        {
            var collection = _dbContextProvider.GetCollection<Directory>(CollectionName);
            return await collection.CountDocumentsAsync(BuildChildFilter(parentId, search), cancellationToken: cancellationToken);
        }

        public async Task<List<Directory>> GetByConfigurationNameAsync(string configurationName, CancellationToken cancellationToken = default)
        {
            var b = Builders<Directory>.Filter;
            var filter = b.Eq(d => d.ConfigurationName, configurationName)
                         & b.Eq(d => d.IsArchived, false);

            var collection = _dbContextProvider.GetCollection<Directory>(CollectionName);
            return await collection.Find(filter)
                .SortBy(d => d.Name).ThenBy(d => d.ItemId)
                .ToListAsync(cancellationToken);
        }

        /// <summary>
        /// One-row form of the children predicate. Root folders carry a null or empty parent
        /// id depending on whether they were created by the new model or migrated from the
        /// legacy DmsArtifact store, so the empty parentId matches both.
        /// </summary>
        private FilterDefinition<Directory> BuildChildFilter(string parentId, string? search)
        {
            var b = Builders<Directory>.Filter;
            var filter = ParentFilter(b, d => d.ParentDirectoryID, parentId)
                         & b.Eq(d => d.IsArchived, false);

            if (!string.IsNullOrWhiteSpace(search))
            {
                filter &= b.Regex(d => d.Name, new BsonRegularExpression(Escape(search), "i"));
            }

            return filter;
        }

        private static FilterDefinition<Directory> ParentFilter(
            FilterDefinitionBuilder<Directory> b,
            System.Linq.Expressions.Expression<Func<Directory, string?>> field,
            string parentId)
            => string.IsNullOrWhiteSpace(parentId)
                ? b.Or(b.Eq(field, (string?)null), b.Eq(field, ""))
                : b.Eq(field, parentId);
        private static string Escape(string value) => Regex.Escape(value);
    }
}
