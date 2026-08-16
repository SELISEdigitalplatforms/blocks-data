using Blocks.Genesis;
using DomainService.Storage;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Dtos;
using Storage.DomainService.Entities;
using Storage.DomainService.Storage;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    [ExcludeFromCodeCoverage]
    public class FileRepository : IFileRepository
    {
        private readonly IDbContextProvider _dbContextProvider;

        public FileRepository(IDbContextProvider dbContextProvider)
        {
            _dbContextProvider = dbContextProvider;
        }

        public (IEnumerable<BsonDocument>, FileResponse[]) GetRequiredFiles(IEnumerable<string> fileIds, long? version)
        {
            var filesCollection = _dbContextProvider.GetCollection<FileResponse>(string.Format("{0}s", typeof(File).Name));

            var filesFilter = Builders<FileResponse>.Filter.In("_id", fileIds);

            var files = filesCollection.Find(filesFilter)
                .Project<FileResponse>(filesProjection)
                .Sort(fileSort)
                .ToEnumerable().ToArray();
            var dataBase = _dbContextProvider.GetDatabase(BlocksContext.GetContext()?.TenantId ?? string.Empty);

            var fileVersionCollection = dataBase.GetCollection<BsonDocument>("FileVersions");


            var match = Builders<BsonDocument>.Filter.In("FileId", files.Select(f => f.ItemId));

            if (version.HasValue)
            {
                match &= Builders<BsonDocument>.Filter.Eq("No", version);
            }

            var fileVersionAggregates = fileVersionCollection
            .Aggregate()
            .Match(match)
            .Sort(fileVersionAggregateGroupSort)
            .Group(fileVersionAggregateGroup)
            .ToEnumerable();

            return (fileVersionAggregates, files);
        }

        public async Task CreateFileAsync(File file)
        {
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            await collection.InsertOneAsync(file);
        }

        public async Task DeleteFileAsync(File file)
        {
            var filter = Builders<File>.Filter.Eq(e => e.ItemId, file.ItemId);
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            await collection.DeleteOneAsync(filter);
        }

        public Task<File> GetFileByItemIdAsync(string itemId)
        {
            var filter = Builders<File>.Filter.Eq(e => e.ItemId, itemId);
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            return collection.Find(filter).SingleOrDefaultAsync();
        }

        public async Task<File> GetFileByItemIdAsync(string itemId, string tenantId)
        {
            var filter = Builders<File>.Filter.Eq(e => e.ItemId, itemId);
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            return await collection.Find(filter).SingleOrDefaultAsync();
        }

        public async Task UpdateFileAsync(File file)
        {
            var filter = Builders<File>.Filter.Eq(e => e.ItemId, file.ItemId);
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            var originalFile = await collection.Find(filter).FirstOrDefaultAsync();

            file.Url = originalFile.Url;

            await collection.ReplaceOneAsync(filter, file, new ReplaceOptions { IsUpsert = true });
        }

        private static readonly ProjectionDefinition<FileResponse> filesProjection = Builders<FileResponse>.Projection
               .Include(file => file.AccessModifier)
               .Include(file => file.CreateDate)
               .Include(file => file.CreatedBy)
               .Include(file => file.ItemId)
               .Include(file => file.Language)
               .Include(file => file.MetaData)
               .Include(file => file.Name)
               .Include(file => file.ParentDirectoryID)
               .Include(file => file.SystemName)
               .Include(file => file.Tags)
               .Include(file => file.TenantId)
               .Include(file => file.Type)
               .Include(file => file.TypeString);

        private static readonly SortDefinition<FileResponse> fileSort = Builders<FileResponse>.Sort.Ascending(file => file.ItemId);
        private static readonly SortDefinition<BsonDocument> fileVersionAggregateGroupSort = Builders<BsonDocument>.Sort.Descending("No");

        private static readonly BsonDocument fileVersionAggregateGroup =
                       new BsonDocument
                           {
                                { "_id","$FileId" },
                                { "SizeInBytes", new BsonDocument
                                                 {
                                                     { "$first", "$SizeInBytes" }
                                                 } },
                                { "VersionId", new BsonDocument
                                                 {
                                                     { "$first", "$_id" }
                                                 } },
                                {
                                    "MaxVersion", new BsonDocument
                                                 {
                                                     { "$max", "$No" }
                                                 }
                                }
                           };


        public async Task<(IQueryable<T>?, long)> GetFilesInfoAsync<T, R>(R query) where R : BaseGetsRequest<GetFilesInfoFilter>
        {
            var collection = GetCollection<File>();

            var filter = BuildAgentFilter(query.Filter);
            var sort = BuildSortDefinition(query.Sort);
            var projection = Builders<File>.Projection.As<T>();

            var totalCount = await collection.CountDocumentsAsync(filter);

            var options = new FindOptions<File, T>
            {
                Skip = query.PageSize * query.Page,
                Limit = query.PageSize,
                Sort = sort,
                Projection = projection
            };

            var cursor = await collection.FindAsync(filter, options);
            var data = await cursor.ToListAsync();

            return (data.AsQueryable(), totalCount);
        }


        public IMongoCollection<T> GetCollection<T>()
        {
            return _dbContextProvider.GetCollection<T>($"{typeof(T).Name}s");
        }
        private static FilterDefinition<File> BuildAgentFilter(GetFilesInfoFilter? filter)
        {
            var builder = Builders<File>.Filter;
            var filters = new List<FilterDefinition<File>>();

            if (filter == null) return builder.Empty;


            if (!string.IsNullOrWhiteSpace(filter.Name))
                filters.Add(builder.Eq(u => u.Name, filter.Name));

            if (!string.IsNullOrWhiteSpace(filter.TenantId))
                filters.Add(builder.Eq(u => u.TenantId, filter.TenantId));

            if (filter.AdditionalProperties != null && filter.AdditionalProperties.Any())
            {
                foreach (var prop in filter.AdditionalProperties)
                {
                    filters.Add(builder.Eq($"AdditionalProperties.{prop.Key}", prop.Value));
                }
            }

            return filters.Any() ? builder.And(filters) : builder.Empty;
        }

        private static SortDefinition<File> BuildSortDefinition(BaseSortRequest? sortRequest)
        {
            var builder = Builders<File>.Sort;

            if (sortRequest == null || string.IsNullOrWhiteSpace(sortRequest.Property))
                return builder.Descending(u => u.CreatedDate);

            return sortRequest.IsDescending
                ? builder.Descending(sortRequest.Property)
                : builder.Ascending(sortRequest.Property);
        }

        public async Task<FileVersion> GetFileVersions(string fileStorageId)
        {
            var collection = GetCollection<FileVersion>();

            var builder = Builders<FileVersion>.Filter;
            var filters = new List<FilterDefinition<FileVersion>>();

            if (!string.IsNullOrWhiteSpace(fileStorageId))
                filters.Add(builder.Eq(u => u.FileId, fileStorageId));

            var filter = filters.Any() ? builder.And(filters) : builder.Empty;
            var projection = Builders<FileVersion>.Projection.As<FileVersion>();

            var options = new FindOptions<FileVersion, FileVersion>
            {
                Projection = projection
            };

            var cursor = await collection.FindAsync(filter, options);
            var data = await cursor.FirstOrDefaultAsync();

            return data;
        }

        public async Task DeleteFilesAsync(IEnumerable<File> files)
        {
            var itemIds = files.Select(f => f.ItemId).ToList();
            var filter = Builders<File>.Filter.In(f => f.ItemId, itemIds);
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            await collection.DeleteManyAsync(filter);
        }

        public async Task<List<File>> FindChildrenAsync(
            string parentId,
            string? afterName,
            string? afterId,
            int take,
            string? search,
            CancellationToken cancellationToken = default)
        {
            var filter = BuildChildFileFilter(parentId, search);

            if (!string.IsNullOrEmpty(afterName) && !string.IsNullOrEmpty(afterId))
            {
                var b = Builders<File>.Filter;
                filter &= b.Gt(f => f.Name, afterName)
                         | (b.Eq(f => f.Name, afterName) & b.Gt(f => f.ItemId, afterId));
            }

            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            return await collection.Find(filter)
                .SortBy(f => f.Name).ThenBy(f => f.ItemId)
                .Limit(take)
                .ToListAsync(cancellationToken);
        }

        public async Task<long> CountChildrenAsync(string parentId, string? search, CancellationToken cancellationToken = default)
        {
            var collection = _dbContextProvider.GetCollection<File>(string.Format("{0}s", typeof(File).Name));
            return await collection.CountDocumentsAsync(BuildChildFileFilter(parentId, search), cancellationToken: cancellationToken);
        }

        private static FilterDefinition<File> BuildChildFileFilter(string parentId, string? search)
        {
            var b = Builders<File>.Filter;
            var filter = ParentFilter(b, f => f.DirectoryId, parentId)
                         & b.Eq(f => f.IsArchived, false);

            if (!string.IsNullOrWhiteSpace(search))
            {
                filter &= b.Regex(f => f.Name, new BsonRegularExpression(Escape(search), "i"));
            }

            return filter;
        }

        private static FilterDefinition<File> ParentFilter(
            FilterDefinitionBuilder<File> b,
            System.Linq.Expressions.Expression<Func<File, string?>> field,
            string parentId)
            => string.IsNullOrWhiteSpace(parentId)
                ? b.Or(b.Eq(field, (string?)null), b.Eq(field, ""))
                : b.Eq(field, parentId);

        private static string Escape(string value) => System.Text.RegularExpressions.Regex.Escape(value);
    }
}
