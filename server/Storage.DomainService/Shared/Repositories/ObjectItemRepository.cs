using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public class ObjectItemRepository : IObjectItemRepository
    {
        private const string CollectionName = "ObjectItems";
        private readonly IDbContextProvider _dbContextProvider;
        public ObjectItemRepository(IDbContextProvider dbContextProvider) => _dbContextProvider = dbContextProvider;
        private IMongoCollection<ObjectItem> Items => _dbContextProvider.GetCollection<ObjectItem>(CollectionName);

        public Task UpsertAsync(ObjectItem item, CancellationToken cancellationToken = default) =>
            Items.ReplaceOneAsync(Builders<ObjectItem>.Filter.Eq(i => i.ObjectReferenceId, item.ObjectReferenceId), item,
                new ReplaceOptions { IsUpsert = true }, cancellationToken);

        public Task DeleteAsync(string objectReferenceId, CancellationToken cancellationToken = default) =>
            Items.DeleteOneAsync(Builders<ObjectItem>.Filter.Eq(i => i.ObjectReferenceId, objectReferenceId), cancellationToken);

        public Task SetInheritanceAsync(string objectReferenceId, bool inherits, CancellationToken cancellationToken = default) =>
            Items.UpdateOneAsync(Builders<ObjectItem>.Filter.Eq(i => i.ObjectReferenceId, objectReferenceId),
                Builders<ObjectItem>.Update.Set(i => i.InheritsParentAccess, inherits)
                    .Set(i => i.LastUpdatedDate, DateTime.UtcNow), cancellationToken: cancellationToken);

        public Task SetArchiveByDirectoryIdsAsync(IReadOnlyCollection<string> directoryIds, bool isArchived, CancellationToken cancellationToken = default)
        {
            if (directoryIds.Count == 0) return Task.CompletedTask;
            var b = Builders<ObjectItem>.Filter;
            var filter = b.Or(b.In(i => i.ObjectReferenceId, directoryIds), b.In(i => i.ParentDirectoryId, directoryIds), b.AnyIn(i => i.AncestorIds, directoryIds));
            return Items.UpdateManyAsync(filter, Builders<ObjectItem>.Update
                .Set(i => i.IsArchived, isArchived).Set(i => i.LastUpdatedDate, DateTime.UtcNow), cancellationToken: cancellationToken);
        }

        public Task<List<ObjectItem>> FindPageAsync(ObjectItemQuery query, CancellationToken cancellationToken = default)
        {
            var b = Builders<ObjectItem>.Filter;
            var filter = b.Empty;
            if (query.IsArchived.HasValue) filter &= b.Eq(i => i.IsArchived, query.IsArchived.Value);
            if (query.Type.HasValue) filter &= b.Eq(i => i.Type, query.Type.Value);
            if (query.FilterByParent)
            {
                filter &= string.IsNullOrWhiteSpace(query.ParentDirectoryId)
                    ? b.Or(b.Eq(i => i.ParentDirectoryId, null), b.Eq(i => i.ParentDirectoryId, string.Empty))
                    : b.Eq(i => i.ParentDirectoryId, query.ParentDirectoryId);
            }
            if (!string.IsNullOrWhiteSpace(query.DirectoryId)) filter &= b.AnyEq(i => i.AncestorIds, query.DirectoryId);
            if (!string.IsNullOrWhiteSpace(query.Search)) filter &= b.Regex(i => i.Name, new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(query.Search.Trim()), "i"));

            if (query.Cursor is { } cursor)
            {
                // ObjectCursor sorts directories before files, then ordinal name/id.
                filter &= b.Or(
                    b.Lt(i => i.Type, cursor.Type),
                    b.And(b.Eq(i => i.Type, cursor.Type), b.Gt(i => i.Name, cursor.Name)),
                    b.And(b.Eq(i => i.Type, cursor.Type), b.Eq(i => i.Name, cursor.Name), b.Gt(i => i.ObjectReferenceId, cursor.ItemId)));
            }

            return Items.Find(filter)
                .SortByDescending(i => i.Type).ThenBy(i => i.Name).ThenBy(i => i.ObjectReferenceId)
                .Limit(query.Take).ToListAsync(cancellationToken);
        }
    }
}
