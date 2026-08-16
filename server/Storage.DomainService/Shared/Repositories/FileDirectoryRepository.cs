using Blocks.Genesis;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace Storage.DomainService.Services
{
    [ExcludeFromCodeCoverage]
    public class FileDirectoryRepository : IFileDirectoryRepository
    {
        // The live collection is "FileDirectories" (the storage services and every test insert into
        // this name). The generic convention "typeof(T).Name + 's'" would yield "Directorys"
        // for this entity, so the listing methods use the actual collection name directly.
        private const string CollectionName = "FileDirectories";

        private readonly IDbContextProvider _dbContextProvider;

        public FileDirectoryRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        public async Task CreateDirectoryAsync(FileDirectory directory)
        {
            var entities = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            await entities.InsertOneAsync(directory);
        }

        public async Task CreateDirectoriesAsync(List<FileDirectory> directories)
        {
            if (directories.Count == 0) return;
            var entities = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            await entities.InsertManyAsync(directories);
        }

        public async Task UpdateDirectory(FileDirectory directory)
        {
            var filter = Builders<FileDirectory>.Filter.Eq(e => e.ItemId, directory.ItemId);
            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            await collection.ReplaceOneAsync(filter, directory, new ReplaceOptions { IsUpsert = true });
        }

        public async Task<List<FileDirectory>> GetDirectories(string directoryId)
        {
            var filter = Builders<FileDirectory>.Filter.Eq(e => e.ParentId, directoryId);
            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            var directories = collection.Find(filter);
            return await directories.ToListAsync();
        }

        public async Task<FileDirectory> GetDirectoryByItemIDAsync(string itemID)
        {
            FilterDefinition<FileDirectory> filter = Builders<FileDirectory>.Filter.Eq("_id", itemID);
            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await collection.Find(filter).SingleOrDefaultAsync();
        }

        public async Task<FileDirectory?> GetDefaultDirectoryByModuleNameAsync(string moduleName, CancellationToken cancellationToken = default)
        {
            var b = Builders<FileDirectory>.Filter;
            var filter = (b.Eq(d => d.ModuleName, moduleName) | b.Eq(d => d.Description, moduleName))
                         & b.Eq(d => d.IsArchived, false);

            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await (await collection.FindAsync(filter, cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<FileDirectory?> FindByIdAsync(string directoryId, bool includeArchived, CancellationToken cancellationToken = default)
        {
            var b = Builders<FileDirectory>.Filter;
            var filter = b.Eq(d => d.ItemId, directoryId);

            if (!includeArchived)
            {
                filter &= b.Eq(d => d.IsArchived, false);
            }

            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await (await collection.FindAsync(filter, cancellationToken: cancellationToken))
                .FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<List<FileDirectory>> FindChildrenAsync(
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
                var b = Builders<FileDirectory>.Filter;
                filter &= b.Gt(d => d.Name, afterName)
                         | (b.Eq(d => d.Name, afterName) & b.Gt(d => d.ItemId, afterId));
            }

            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await collection.Find(filter)
                .SortBy(d => d.Name).ThenBy(d => d.ItemId)
                .Limit(take)
                .ToListAsync(cancellationToken);
        }

        public async Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default)
        {
            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await collection.CountDocumentsAsync(BuildChildFilter(parentId, search), cancellationToken: cancellationToken);
        }

        public async Task<List<FileDirectory>> GetByConfigurationNameAsync(string configurationName, CancellationToken cancellationToken = default)
        {
            var b = Builders<FileDirectory>.Filter;
            var filter = b.Eq(d => d.ConfigurationName, configurationName)
                         & b.Eq(d => d.IsArchived, false);

            var collection = _dbContextProvider.GetCollection<FileDirectory>(CollectionName);
            return await collection.Find(filter)
                .SortBy(d => d.Name).ThenBy(d => d.ItemId)
                .ToListAsync(cancellationToken);
        }

        /// <summary>
        /// One-row form of the children predicate. Root directorys carry a null or empty parent
        /// id depending on whether they were created by the new model or migrated from the
        /// legacy DmsArtifact store, so the empty parentId matches both.
        /// </summary>
        private FilterDefinition<FileDirectory> BuildChildFilter(string parentId, string? search)
        {
            var b = Builders<FileDirectory>.Filter;
            var filter = ParentFilter(b, d => d.ParentId, parentId)
                         & b.Eq(d => d.IsArchived, false);

            if (!string.IsNullOrWhiteSpace(search))
            {
                filter &= b.Regex(d => d.Name, new BsonRegularExpression(Escape(search), "i"));
            }

            return filter;
        }

        private static FilterDefinition<FileDirectory> ParentFilter(
            FilterDefinitionBuilder<FileDirectory> b,
            System.Linq.Expressions.Expression<Func<FileDirectory, string?>> field,
            string parentId)
            => string.IsNullOrWhiteSpace(parentId)
                ? b.Or(b.Eq(field, (string?)null), b.Eq(field, ""))
                : b.Eq(field, parentId);
        private static string Escape(string value) => Regex.Escape(value);
    }
}
