using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Conversion;

/// <summary>
/// Converts GraphQL-typed order input (list of { field, direction }) to MongoDB sort document.
/// Validates field names against schema.
/// </summary>
public static class OrderToMongoSortConverter
{
    /// <summary>
    /// Converts a list of sort entries to a MongoDB BsonDocument sort definition.
    /// </summary>
    /// <param name="order">List of objects with "field" (string) and "direction" (e.g. "ASC"/"DESC").</param>
    /// <param name="schema">Schema used to validate field names.</param>
    /// <returns>BsonDocument sort, or null if order is null/empty.</returns>
    public static BsonDocument? Convert(object? order, SchemaDefinitionExtended schema)
        => Convert(ToOrderItems(order), schema);

    /// <summary>
    /// Reads an <c>order</c> argument (a list of <c>{ field, direction }</c> entries). Entries that are not
    /// objects or have no field are skipped; a missing or unrecognised direction means ascending. Returns null when
    /// no entry remains.
    /// </summary>
    public static IReadOnlyList<OrderItem>? ToOrderItems(object? order)
    {
        if (order is not IList<object> list || list.Count == 0) return null;

        var items = new List<OrderItem>();
        foreach (var item in list)
        {
            if (item is not IReadOnlyDictionary<string, object?> entry)
                continue;
            if (!entry.TryGetValue("field", out var fieldObj) || fieldObj is null)
                continue;

            var direction = SortDirection.ASC;
            if (entry.TryGetValue("direction", out var directionObj) && directionObj != null)
                direction = directionObj.ToString()?.ToUpperInvariant() == "DESC" ? SortDirection.DESC : SortDirection.ASC;

            items.Add(new OrderItem(fieldObj.ToString()?.Trim() ?? string.Empty, direction));
        }

        return items.Count == 0 ? null : items;
    }

    /// <summary>
    /// Converts plain sort entries to a MongoDB BsonDocument sort definition, validating each field against the schema.
    /// </summary>
    /// <returns>BsonDocument sort, or null if order is null/empty.</returns>
    public static BsonDocument? Convert(IReadOnlyList<OrderItem>? order, SchemaDefinitionExtended schema)
    {
        if (order is null || order.Count == 0) return null;

        var allowedFields = schema.Fields.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var sortDoc = new BsonDocument();

        foreach (var item in order)
        {
            var fieldName = item.Field;
            if (string.IsNullOrEmpty(fieldName) || fieldName.StartsWith("$", StringComparison.Ordinal))
                throw new ArgumentException($"Invalid or disallowed sort field: '{fieldName}'.");

            if (!allowedFields.Contains(fieldName))
                throw new ArgumentException($"Sort field '{fieldName}' is not defined on the schema.");

            var dbFieldName = fieldName == nameof(GraphQlBaseEntity.ItemId)
                ? GraphQlConstant.DbEntityIdFieldName
                : fieldName;

            sortDoc[dbFieldName] = item.Direction == SortDirection.DESC ? -1 : 1;
        }

        return sortDoc.ElementCount == 0 ? null : sortDoc;
    }
}
