using System.IO.Compression;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace DataGateway.DomainService.Services;

public class SchemaSnapshotStore : ISchemaSnapshotStore
{
    /// <summary>
    /// Size of one stored piece of compressed content. Well under MongoDB's 16 MB document limit,
    /// so even tenants with many hundreds of schemas can be published.
    /// </summary>
    public const int DefaultChunkSizeBytes = 4 * 1024 * 1024;

    private readonly IDbRepository _repository;
    private readonly int _chunkSizeBytes;

    public SchemaSnapshotStore(IDbRepository repository) : this(repository, DefaultChunkSizeBytes)
    {
    }

    public SchemaSnapshotStore(IDbRepository repository, int chunkSizeBytes)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(chunkSizeBytes);
        _chunkSizeBytes = chunkSizeBytes;
    }

    /// <summary>
    /// Serializes and compresses <paramref name="source"/>. Done before the source is used to
    /// build a schema, because building modifies the definitions.
    /// </summary>
    public static SchemaSnapshotContent Pack(SchemaSource source)
    {
        var document = new BsonDocument
        {
            { nameof(SchemaSource.SchemaDefinitions), new BsonArray(source.SchemaDefinitions.Select(d => d.ToBsonDocument())) },
            { nameof(SchemaSource.DataValidations), new BsonArray(source.DataValidations.Select(v => v.ToBsonDocument())) },
            { nameof(SchemaSource.DataAccessPolicies), new BsonArray(source.DataAccessPolicies.Select(p => p.ToBsonDocument())) }
        };
        var raw = document.ToBson();

        using var compressed = new MemoryStream();
        using (var gzip = new GZipStream(compressed, CompressionLevel.Optimal, leaveOpen: true))
        {
            gzip.Write(raw);
        }

        return new SchemaSnapshotContent(compressed.ToArray(), raw.LongLength, source.SchemaDefinitions.Count);
    }

    public static SchemaSource Unpack(byte[] compressedBytes)
    {
        using var input = new GZipStream(new MemoryStream(compressedBytes), CompressionMode.Decompress);
        using var raw = new MemoryStream();
        input.CopyTo(raw);

        var document = BsonSerializer.Deserialize<BsonDocument>(raw.ToArray());
        return new SchemaSource
        {
            SchemaDefinitions = ReadArray<SchemaDefinition>(document, nameof(SchemaSource.SchemaDefinitions)),
            DataValidations = ReadArray<DataValidation>(document, nameof(SchemaSource.DataValidations)),
            DataAccessPolicies = ReadArray<DataAccessPolicy>(document, nameof(SchemaSource.DataAccessPolicies))
        };
    }

    public async Task<PublishedSchemaSnapshot> SaveAsync(
        string tenantId,
        long version,
        SchemaSnapshotContent content,
        SchemaSnapshotKind kind,
        IReadOnlyCollection<string> changeLogIds,
        CancellationToken cancellationToken = default)
    {
        var chunks = content.CompressedBytes
            .Chunk(_chunkSizeBytes)
            .Select((data, index) =>
            {
                var chunk = new PublishedSchemaSnapshotChunk
                {
                    ItemId = PublishedSchemaSnapshotChunk.IdFor(version, index),
                    Version = version,
                    Index = index,
                    Data = data
                };
                chunk.InjectDefaultValue();
                return chunk;
            })
            .ToList();

        if (chunks.Count > 0)
        {
            await _repository.InsertManyAsync(chunks, tenantId);
        }

        var manifest = new PublishedSchemaSnapshot
        {
            ItemId = PublishedSchemaSnapshot.IdFor(version),
            Version = version,
            Kind = kind,
            ChunkCount = chunks.Count,
            RawSizeBytes = content.RawSizeBytes,
            CompressedSizeBytes = content.CompressedBytes.LongLength,
            SchemaCount = content.SchemaCount,
            ChangeLogIds = changeLogIds.ToList(),
            PublishedDate = DateTime.UtcNow
        };
        manifest.InjectDefaultValue();
        manifest.PublishedBy = manifest.CreatedBy;

        // Written last: the manifest is what makes the snapshot visible. Its id is the version, so a
        // second write of the same version fails instead of replacing a published snapshot.
        await _repository.InsertAsync(manifest, tenantId);
        return manifest;
    }

    public async Task<SchemaSource?> LoadAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        var manifest = await _repository.GetItemAsync<PublishedSchemaSnapshot>(PublishedSchemaSnapshot.IdFor(version), tenantId);
        if (manifest is null)
        {
            return null;
        }

        var chunks = await _repository.GetItemsAsync<PublishedSchemaSnapshotChunk, PublishedSchemaSnapshotChunk>(
            Builders<PublishedSchemaSnapshotChunk>.Filter.Eq(c => c.Version, version),
            Builders<PublishedSchemaSnapshotChunk>.Sort.Ascending(c => c.Index),
            tenantId);

        if (chunks.Count != manifest.ChunkCount || chunks.Select(c => c.Index).Where((index, position) => index != position).Any())
        {
            throw new InvalidDataException(
                $"Published schema version {version} is incomplete: expected {manifest.ChunkCount} chunks, found {chunks.Count}.");
        }

        return Unpack(chunks.SelectMany(c => c.Data).ToArray());
    }

    private static List<T> ReadArray<T>(BsonDocument document, string name) =>
        document.TryGetValue(name, out var value) && value.IsBsonArray
            ? value.AsBsonArray.Select(item => BsonSerializer.Deserialize<T>(item.AsBsonDocument)).ToList()
            : [];
}
