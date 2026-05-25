using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;

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
    {
        if (order is null) return null;
        if (order is not IList<object> list || list.Count == 0) return null;

        var allowedFields = schema.Fields.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var sortDoc = new BsonDocument();

        foreach (var item in list)
        {
            if (item is not IReadOnlyDictionary<string, object?> entry)
                continue;
            if (!entry.TryGetValue("field", out var fieldObj) || fieldObj is null)
                continue;

            var fieldName = fieldObj.ToString()?.Trim();
            if (string.IsNullOrEmpty(fieldName) || fieldName.StartsWith("$", StringComparison.Ordinal))
                throw new ArgumentException($"Invalid or disallowed sort field: '{fieldName}'.");

            if (!allowedFields.Contains(fieldName))
                throw new ArgumentException($"Sort field '{fieldName}' is not defined on the schema.");

            var dbFieldName = fieldName == nameof(Entities.GraphQlBaseEntity.ItemId)
                ? GraphQlConstant.DbEntityIdFieldName
                : fieldName;

            var direction = 1;
            if (entry.TryGetValue("direction", out var dirObj) && dirObj != null)
            {
                var dirStr = dirObj.ToString()?.ToUpperInvariant();
                direction = dirStr == "DESC" ? -1 : 1;
            }

            sortDoc[dbFieldName] = direction;
        }

        return sortDoc.ElementCount == 0 ? null : sortDoc;
    }
}
