using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;

namespace DataGateway.DomainService.Services;

public class SchemaVersionStore : ISchemaVersionStore
{
    private const string CollectionName = $"{nameof(SchemaPublishState)}s";

    private readonly IDbRepository _repository;

    public SchemaVersionStore(IDbRepository repository)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
    }

    public async Task<long> GetAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var state = await _repository.GetItemAsync(CollectionName, SchemaPublishState.StateId, tenantId);
        return ReadVersion(state);
    }

    public async Task<long> BumpAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        var filter = new BsonDocument(GraphQlConstant.DbEntityIdFieldName, SchemaPublishState.StateId);
        var update = new BsonDocument
        {
            { "$inc", new BsonDocument(nameof(SchemaPublishState.CurrentVersion), 1L) },
            { "$currentDate", new BsonDocument(nameof(SchemaPublishState.LastUpdatedDate), true) }
        };

        var state = await _repository.FindOneAndUpdateAsync(CollectionName, filter, update, isUpsert: true, tenantId);
        return ReadVersion(state);
    }

    private static long ReadVersion(BsonDocument? state) =>
        state != null && state.TryGetValue(nameof(SchemaPublishState.CurrentVersion), out var value) && value.IsNumeric
            ? value.ToInt64()
            : 0;
}
