using Blocks.Genesis;
using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace DomainService.Configuration
{
    /// <summary>The <c>storage-config:*</c> rows of one database. A read error is an error, never "no row".</summary>
    internal interface IStorageSettingsRows
    {
        Task<StorageSettings?> GetAsync(string name, CancellationToken cancellationToken);
        Task<IReadOnlyList<StorageSettings>> GetAllAsync(CancellationToken cancellationToken);
        Task SetAsync(StorageSettings settings, CancellationToken cancellationToken);

        /// <summary>Writes the row only when none exists. True when this call wrote it.</summary>
        Task<bool> TryInsertAsync(StorageSettings settings, CancellationToken cancellationToken);

        Task<bool> DeleteAsync(string name, CancellationToken cancellationToken);
    }

    internal static class StorageSettingsRows
    {
        public static IStorageSettingsRows For(StorageConfigScope? scope, IKeyValueStore keyValueStore) =>
            scope?.Database is { } database
                ? new DatabaseRows(database)
                : new KeyValueStoreRows(keyValueStore);

        /// <summary>The caller's tenant DB, through the Genesis key-value store (impersonated).</summary>
        private sealed class KeyValueStoreRows(IKeyValueStore store) : IStorageSettingsRows
        {
            public Task<StorageSettings?> GetAsync(string name, CancellationToken cancellationToken) =>
                store.GetAsync<StorageSettings>(StorageConfigurationKeys.KeyFor(name), impersonated: true, cancellationToken);

            public Task<IReadOnlyList<StorageSettings>> GetAllAsync(CancellationToken cancellationToken) =>
                store.GetByPrefixAsync<StorageSettings>(StorageConfigurationKeys.KeyPrefix, impersonated: true, cancellationToken);

            public Task SetAsync(StorageSettings settings, CancellationToken cancellationToken) =>
                store.SetAsync(StorageConfigurationKeys.KeyFor(settings.Name), settings, impersonated: true, cancellationToken);

            /// <summary>Not atomic (the Genesis store has no insert-only call); the explicit-database path is.</summary>
            public async Task<bool> TryInsertAsync(StorageSettings settings, CancellationToken cancellationToken)
            {
                var key = StorageConfigurationKeys.KeyFor(settings.Name);
                if (await store.ExistsAsync(key, impersonated: true, cancellationToken).ConfigureAwait(false))
                    return false;
                await store.SetAsync(key, settings, impersonated: true, cancellationToken).ConfigureAwait(false);
                return true;
            }

            public Task<bool> DeleteAsync(string name, CancellationToken cancellationToken) =>
                store.DeleteAsync(StorageConfigurationKeys.KeyFor(name), impersonated: true, cancellationToken);
        }

        /// <summary>
        /// An explicit database (another tenant, the seed DB). Same document shape as the Genesis
        /// <c>MongoKeyValueStore</c> (<see cref="KeyValueEntry"/>, value under <c>Value</c>).
        /// </summary>
        private sealed class DatabaseRows(IMongoDatabase database) : IStorageSettingsRows
        {
            private const string CollectionName = "KeyValueStores";

            private IMongoCollection<KeyValueEntry> Collection => database.GetCollection<KeyValueEntry>(CollectionName);

            public async Task<StorageSettings?> GetAsync(string name, CancellationToken cancellationToken)
            {
                var key = StorageConfigurationKeys.KeyFor(name);
                var entry = await Collection.Find(x => x.Key == key).FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
                return entry is null || entry.Value.IsBsonNull ? null : Deserialize(entry.Value);
            }

            public async Task<IReadOnlyList<StorageSettings>> GetAllAsync(CancellationToken cancellationToken)
            {
                var filter = Builders<KeyValueEntry>.Filter.Regex(
                    x => x.Key,
                    new BsonRegularExpression("^" + System.Text.RegularExpressions.Regex.Escape(StorageConfigurationKeys.KeyPrefix)));
                var entries = await Collection.Find(filter).ToListAsync(cancellationToken).ConfigureAwait(false);
                return entries.Where(e => !e.Value.IsBsonNull).Select(e => Deserialize(e.Value)).ToList();
            }

            public async Task SetAsync(StorageSettings settings, CancellationToken cancellationToken)
            {
                var key = StorageConfigurationKeys.KeyFor(settings.Name);
                var now = DateTime.UtcNow;
                var value = Serialize(settings);
                var update = OnInsert(key, settings, now)
                    .Set(x => x.Value, value)
                    .Set(x => x.LastUpdatedDate, now)
                    .Set(x => x.LastUpdatedBy, settings.LastUpdatedBy);
                await Collection.UpdateOneAsync(x => x.Key == key, update, new UpdateOptions { IsUpsert = true }, cancellationToken)
                    .ConfigureAwait(false);
            }

            public async Task<bool> TryInsertAsync(StorageSettings settings, CancellationToken cancellationToken)
            {
                var key = StorageConfigurationKeys.KeyFor(settings.Name);
                var now = DateTime.UtcNow;
                var update = OnInsert(key, settings, now)
                    .SetOnInsert(x => x.Value, Serialize(settings))
                    .SetOnInsert(x => x.LastUpdatedDate, now)
                    .SetOnInsert(x => x.LastUpdatedBy, settings.LastUpdatedBy);
                try
                {
                    var result = await Collection.UpdateOneAsync(x => x.Key == key, update, new UpdateOptions { IsUpsert = true }, cancellationToken)
                        .ConfigureAwait(false);
                    return result.UpsertedId is not null;
                }
                catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
                {
                    // Insert/insert race (or a legacy unique index): the other writer won.
                    return false;
                }
            }

            public async Task<bool> DeleteAsync(string name, CancellationToken cancellationToken)
            {
                var key = StorageConfigurationKeys.KeyFor(name);
                var result = await Collection.DeleteOneAsync(x => x.Key == key, cancellationToken).ConfigureAwait(false);
                return result.DeletedCount > 0;
            }

            private static UpdateDefinition<KeyValueEntry> OnInsert(string key, StorageSettings settings, DateTime now) =>
                Builders<KeyValueEntry>.Update
                    .SetOnInsert(x => x.ItemId, ObjectId.GenerateNewId().ToString())
                    .SetOnInsert(x => x.Key, key)
                    .SetOnInsert(x => x.CreatedDate, now)
                    .SetOnInsert(x => x.CreatedBy, settings.LastUpdatedBy)
                    .SetOnInsert(x => x.OrganizationId, settings.OrganizationId ?? "default")
                    .SetOnInsert(x => x.Tags, []);

            private static StorageSettings Deserialize(BsonValue value) =>
                value.IsBsonDocument
                    ? BsonSerializer.Deserialize<StorageSettings>(value.AsBsonDocument)
                    : throw new FormatException("A storage-config row does not hold a document.");

            private static BsonValue Serialize(StorageSettings settings)
            {
                var wrapper = new BsonDocument();
                using (var writer = new BsonDocumentWriter(wrapper))
                {
                    writer.WriteStartDocument();
                    writer.WriteName("v");
                    BsonSerializer.Serialize(writer, settings);
                    writer.WriteEndDocument();
                }

                return wrapper["v"];
            }
        }
    }
}
