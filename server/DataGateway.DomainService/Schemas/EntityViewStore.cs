using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using MongoDB.Driver;

namespace DataGateway.DomainService.Schemas;

public class EntityViewStore : IEntityViewStore
{
    /// <summary>The <c>SchemaName</c> of the document that marks a version's views as complete.</summary>
    public const string CompleteMarkerName = "__complete";

    private readonly IDbRepository _repository;

    public EntityViewStore(IDbRepository repository)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
    }

    public async Task WriteAsync(string tenantId, long version, SchemaSource fullSource)
    {
        var failures = new List<Exception>();
        foreach (var (schemaName, miniSource) in EntityViewBuilder.Build(fullSource))
        {
            try
            {
                await InsertIgnoringDuplicateAsync(tenantId, version, schemaName, SchemaSnapshotStore.Pack(miniSource).CompressedBytes);
            }
            catch (Exception ex)
            {
                // The other entities still get their views; the version is not marked complete.
                failures.Add(new InvalidOperationException($"The view of {schemaName} in version {version} could not be stored.", ex));
            }
        }

        if (failures.Count > 0)
            throw new AggregateException($"{failures.Count} entity views of version {version} could not be stored.", failures);

        // Written last: the marker is what tells a reader every view of the version is there.
        await InsertIgnoringDuplicateAsync(tenantId, version, CompleteMarkerName, []);
    }

    private async Task InsertIgnoringDuplicateAsync(string tenantId, long version, string schemaName, byte[] content)
    {
        var view = new PublishedEntityView
        {
            ItemId = PublishedEntityView.IdFor(version, schemaName),
            Version = version,
            SchemaName = schemaName,
            Content = content
        };
        view.InjectDefaultValue();

        try
        {
            await _repository.InsertAsync(view, tenantId);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            // Another pod wrote the same view of the same version: identical, so it stays.
        }
    }

    public async Task<SchemaSource?> LoadAsync(string tenantId, long version, string schemaName)
    {
        if (string.Equals(schemaName, CompleteMarkerName, StringComparison.Ordinal))
            return null;
        var view = await _repository.GetItemAsync<PublishedEntityView>(PublishedEntityView.IdFor(version, schemaName), tenantId);
        return view is null ? null : SchemaSnapshotStore.Unpack(view.Content);
    }

    public async Task<bool> HasVersionAsync(string tenantId, long version) =>
        await _repository.GetItemAsync<PublishedEntityView>(PublishedEntityView.IdFor(version, CompleteMarkerName), tenantId) is not null;

    public async Task DeleteExceptAsync(string tenantId, IReadOnlyCollection<long> keptVersions)
    {
        if (keptVersions.Count == 0)
            return;

        var filter = Builders<PublishedEntityView>.Filter;
        await _repository.DeleteManyAsync(
            filter.And(filter.Lt(v => v.Version, keptVersions.Max()), filter.Nin(v => v.Version, keptVersions)),
            tenantId);
    }
}
