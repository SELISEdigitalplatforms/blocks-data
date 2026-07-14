using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;
using System.Collections;
using System.Text.RegularExpressions;

namespace DataGateway.DomainService.Conversion;

/// <summary>
/// Converts GraphQL-typed where input (dictionary tree) to MongoDB filter document.
/// Validates field names against schema and rejects operator injection.
/// </summary>
public static class WhereToMongoFilterConverter
{
    private static readonly HashSet<string> AllowedStringOps = new(StringComparer.OrdinalIgnoreCase)
        { "eq", "neq", "contains", "startsWith", "endsWith", "in" };
    private static readonly HashSet<string> AllowedNumberOps = new(StringComparer.OrdinalIgnoreCase)
        { "eq", "neq", "gt", "gte", "lt", "lte", "in" };
    private static readonly HashSet<string> AllowedBoolOps = new(StringComparer.OrdinalIgnoreCase)
        { "eq", "neq" };
    private static readonly HashSet<string> AllowedDateTimeOps = new(StringComparer.OrdinalIgnoreCase)
        { "eq", "neq", "gt", "gte", "lt", "lte", "in" };

    private static readonly HashSet<string> LogicalOperators = new(StringComparer.OrdinalIgnoreCase)
        { "or", "and" };

    /// <summary>
    /// Converts a typed where object (from GraphQL) to a MongoDB BsonDocument filter.
    /// </summary>
    /// <param name="where">Dictionary representation of the where input (field -> operation object or nested where).</param>
    /// <param name="schema">Schema used to validate field names and types.</param>
    /// <param name="pathPrefix">Current path prefix for nested validation (e.g. "Address.").</param>
    /// <returns>BsonDocument filter, or null if where is null/empty.</returns>
    public static BsonDocument? Convert(
        object? where,
        SchemaDefinitionExtended schema,
        string pathPrefix = "")
    {
        if (where is null) return null;
        if (where is not IReadOnlyDictionary<string, object?> dict || dict.Count == 0)
            return null;

        var allowedFields = GetAllowedFieldNames(schema, pathPrefix);
        var elements = new List<BsonElement>();

        if (string.IsNullOrEmpty(pathPrefix))
        {
            if (dict.TryGetValue("or", out var orValue) && orValue != null)
            {
                var orClause = ConvertLogicalOperator(orValue, schema, "$or");
                if (orClause.HasValue)
                    elements.Add(orClause.Value);
            }
            if (dict.TryGetValue("and", out var andValue) && andValue != null)
            {
                var andClause = ConvertLogicalOperator(andValue, schema, "$and");
                if (andClause.HasValue)
                    elements.Add(andClause.Value);
            }
        }

        foreach (var kv in dict)
        {
            var key = kv.Key;
            if (string.IsNullOrWhiteSpace(key) || key.StartsWith("$", StringComparison.Ordinal))
                throw new ArgumentException($"Invalid or disallowed field name: '{key}'.");

            if (LogicalOperators.Contains(key))
                continue;

            var fullPath = string.IsNullOrEmpty(pathPrefix) ? key : $"{pathPrefix}.{key}";
            if (!allowedFields.Contains(key))
                throw new ArgumentException($"Field '{fullPath}' is not defined on the schema.");

            var fieldDef = GetFieldDefinition(schema, fullPath)
                ?? throw new ArgumentException($"Field '{fullPath}' is not defined on the schema.");

            var value = kv.Value;
            if (value is null) continue;

            var dbFieldName = key == nameof(Entities.GraphQlBaseEntity.ItemId) ? GraphQlConstant.DbEntityIdFieldName : key;
            if (GraphQlTypeHelper.IsScalar(fieldDef.Type))
            {
                var opBson = ConvertScalarOperation(fieldDef.Type, dbFieldName, value);
                if (opBson != null)
                    elements.AddRange(opBson.Elements);
            }
            else
            {
                var nested = Convert(value, schema, fullPath);
                if (nested != null && nested.ElementCount > 0)
                    elements.Add(new BsonElement(key, nested));
            }
        }

        if (elements.Count == 0) return null;
        if (elements.Count == 1) return new BsonDocument(elements[0].Name, elements[0].Value);
        return new BsonDocument("$and", new BsonArray(elements.Select(e => new BsonDocument(e.Name, e.Value))));
    }

    private static BsonElement? ConvertLogicalOperator(object value, SchemaDefinitionExtended schema, string mongoOp)
    {
        if (value is not IList<object?> orArray || orArray.Count == 0)
            return null;

        var clauses = new List<BsonDocument>();
        foreach (var item in orArray)
        {
            if (item == null) continue;
            var clause = Convert(item, schema, "");
            if (clause != null)
                clauses.Add(clause);
        }

        if (clauses.Count == 0) return null;
        return new BsonElement(mongoOp, new BsonArray(clauses));
    }

    private static BsonDocument? ConvertScalarOperation(string scalarType, string fieldName, object value)
    {
        var opDict = CoerceOperationDictionary(value);
        if (opDict is null || opDict.Count == 0)
            return null;

        var allowedOps = GetAllowedOps(scalarType);
        var clauses = new List<BsonElement>();

        foreach (var op in opDict)
        {
            if (op.Value is null) continue;
            var opKey = op.Key;
            if (string.IsNullOrWhiteSpace(opKey) || !allowedOps.Contains(opKey))
                throw new ArgumentException($"Unsupported or invalid operator: '{opKey}' for type {scalarType}.");

            var mongoOp = MapOperatorToMongo(opKey);
            BsonValue bsonVal;
            if (mongoOp == "$regex")
            {
                var str = op.Value?.ToString() ?? string.Empty;
                var lowerOp = opKey.ToLowerInvariant();
                var pattern = lowerOp == "contains"
                    ? Regex.Escape(str)
                    : lowerOp == "startswith"
                        ? "^" + Regex.Escape(str)
                        : Regex.Escape(str) + "$";
                bsonVal = new BsonRegularExpression(pattern, "i");
            }
            else if (op.Value is IList<object?> listVal)
                bsonVal = new BsonArray(listVal.Select(BsonValue.Create).ToArray());
            else if (op.Value is IEnumerable enumerable and not string)
                bsonVal = new BsonArray(enumerable.Cast<object>().Select(BsonValue.Create).ToArray());
            else
                bsonVal = BsonValue.Create(op.Value);

            if (mongoOp == "$eq" && bsonVal.BsonType == BsonType.String && string.IsNullOrEmpty(bsonVal.AsString))
                continue;

            clauses.Add(new BsonElement(mongoOp, bsonVal));
        }

        if (clauses.Count == 0) return null;
        return new BsonDocument(fieldName, new BsonDocument(clauses));
    }

    private static IReadOnlyDictionary<string, object?>? CoerceOperationDictionary(object value) =>
        value switch
        {
            IReadOnlyDictionary<string, object?> d => d,
            IDictionary<string, object?> dict =>
                dict as IReadOnlyDictionary<string, object?>
                ?? dict.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase),
            _ => null
        };

    private static string MapOperatorToMongo(string opKey)
    {
        return opKey.ToLowerInvariant() switch
        {
            "eq" => "$eq",
            "neq" => "$ne",
            "gt" => "$gt",
            "gte" => "$gte",
            "lt" => "$lt",
            "lte" => "$lte",
            "in" => "$in",
            "contains" => "$regex",
            "startswith" => "$regex",
            "endswith" => "$regex",
            _ => throw new ArgumentException($"Unsupported operator: '{opKey}'.")
        };
    }

    private static HashSet<string> GetAllowedOps(string scalarType)
    {
        return scalarType switch
        {
            "String" or "ID" => AllowedStringOps,
            "Int" or "Float" => AllowedNumberOps,
            "Boolean" => AllowedBoolOps,
            "DateTime" => AllowedDateTimeOps,
            _ => AllowedStringOps
        };
    }

    private static HashSet<string> GetAllowedFieldNames(SchemaDefinitionExtended schema, string pathPrefix)
    {
        if (string.IsNullOrEmpty(pathPrefix))
            return schema.Fields.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var parts = pathPrefix.Split('.');
        var current = schema.Fields.AsEnumerable();
        for (var i = 0; i < parts.Length && current.Any(); i++)
        {
            var next = current.FirstOrDefault(f => f.Name.Equals(parts[i], StringComparison.OrdinalIgnoreCase));
            if (next?.Fields == null || !next.Fields.Any())
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            current = next.Fields;
        }
        return current.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static FieldDefinitionResponse? GetFieldDefinition(SchemaDefinitionExtended schema, string fullPath)
    {
        var parts = fullPath.Split('.');
        IList<FieldDefinitionResponse>? current = schema.Fields;
        FieldDefinitionResponse? last = null;
        foreach (var part in parts)
        {
            if (current == null) return null;
            last = current.FirstOrDefault(f => f.Name.Equals(part, StringComparison.OrdinalIgnoreCase));
            if (last == null) return null;
            current = last.Fields?.Count > 0 ? last.Fields : null;
        }
        return last;
    }
}
