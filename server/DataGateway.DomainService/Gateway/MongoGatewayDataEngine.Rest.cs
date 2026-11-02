using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Gateway;

/// <summary>
/// The operations the REST transport needs beyond what GraphQL calls: get by id and upsert. Both are composed from
/// <see cref="QueryAsync"/>, <see cref="InsertAsync"/> and <see cref="UpdateAsync"/>, so the access checks, validation
/// and events are exactly theirs.
/// </summary>
public sealed partial class MongoGatewayDataEngine
{
    private const string ItemIdFieldName = "ItemId";
    private const string UniqueValidationType = "Unique";

    /// <inheritdoc />
    public async Task<Dictionary<string, object>?> GetByIdAsync(
        EntityModel entity, string itemId, IReadOnlyList<string> select, string operationName)
    {
        var response = await QueryAsync(
            entity,
            new QueryCommand(operationName, ById(itemId), null, 1, 1, select));
        return response.Items?.FirstOrDefault();
    }

    /// <inheritdoc />
    public async Task<UpsertResult> UpsertAsync(EntityModel entity, UpsertCommand command)
    {
        var schema = entity.Schema;
        // Whether the row exists is asked without the row rules, so a row they hide is told apart from a missing
        // one: the first goes to the update path, which answers "not found", and is never inserted over.
        var exists = await _repository.GetItemAsync(schema.CollectionName, command.ItemId) is not null;
        if (exists)
            return new UpsertResult(await UpdateExistingAsync(entity, command), Created: false);

        try
        {
            return new UpsertResult(await InsertNewAsync(entity, command), Created: true);
        }
        catch (GatewayException ex) when (IsDuplicateId(ex))
        {
            // Another request created the row between the existence check and the insert: it exists now.
            _logger.LogInformation(
                "Upsert on schema {SchemaName} lost an insert race for {ItemId}; updating instead", schema.SchemaName, command.ItemId);
            return new UpsertResult(await UpdateExistingAsync(entity, command), Created: false);
        }
    }

    private Task<ActionResponse> InsertNewAsync(EntityModel entity, UpsertCommand command) =>
        InsertAsync(entity, new InsertCommand(command.OperationName, new Lazy<Dictionary<string, object?>>(() =>
        {
            // The route's id wins over whatever the record carries.
            var record = CloneRecord(command.Record.Value);
            record[GraphQlConstant.DbEntityIdFieldName] = command.ItemId;
            return record;
        })));

    private Task<ActionResponse> UpdateExistingAsync(EntityModel entity, UpsertCommand command) =>
        UpdateAsync(entity, new UpdateCommand(
            command.OperationName,
            ById(command.ItemId),
            new Lazy<Dictionary<string, object?>>(() =>
            {
                // An update never changes the id.
                var changes = CloneRecord(command.Record.Value);
                changes.Remove(GraphQlConstant.DbEntityIdFieldName);
                return changes;
            })));

    private static WhereNode ById(string itemId) =>
        new(new Dictionary<string, object?>
        {
            [ItemIdFieldName] = new Dictionary<string, object?> { ["eq"] = itemId },
        });

    /// <summary>The failure <see cref="InsertAsync"/> reports for a duplicate <c>_id</c>, and nothing else.</summary>
    private static bool IsDuplicateId(GatewayException ex) =>
        ex.FieldErrors is { Count: > 0 } errors
        && errors.All(error => error.ValidationType == UniqueValidationType
                               && error.Field == GraphQlConstant.DbEntityIdFieldName);

    /// <summary>
    /// A deep copy of a record's dictionaries and lists. The insert stamps and rewrites the record it is given, and the
    /// update after a lost insert race must start from what the caller sent, not from what the failed insert made of it.
    /// </summary>
    private static Dictionary<string, object?> CloneRecord(IReadOnlyDictionary<string, object?> record) =>
        record.ToDictionary(pair => pair.Key, pair => CloneValue(pair.Value));

    private static object? CloneValue(object? value) => value switch
    {
        IReadOnlyDictionary<string, object?> dictionary => CloneRecord(dictionary),
        List<object?> list => list.Select(CloneValue).ToList(),
        _ => value,
    };
}
