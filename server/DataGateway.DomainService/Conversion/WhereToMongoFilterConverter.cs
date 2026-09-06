using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using HotChocolate;
using MongoDB.Bson;
using System.Collections;
using System.Reflection;
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
        var dict = CoerceWhereDictionary(where);
        if (dict is null || dict.Count == 0)
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
                throw Invalid($"Invalid or disallowed field name: '{key}'.");

            if (LogicalOperators.Contains(key))
                continue;

            var fullPath = string.IsNullOrEmpty(pathPrefix) ? key : $"{pathPrefix}.{key}";
            if (!allowedFields.Contains(key))
                throw Invalid($"Field '{fullPath}' is not defined on the schema.");

            var fieldDef = GetFieldDefinition(schema, fullPath)
                ?? throw Invalid($"Field '{fullPath}' is not defined on the schema.");

            var value = kv.Value;
            var dbFieldName = key == nameof(Entities.GraphQlBaseEntity.ItemId)
                ? (string.IsNullOrEmpty(pathPrefix)
                    ? GraphQlConstant.DbEntityIdFieldName
                    : $"{pathPrefix}.{GraphQlConstant.DbEntityIdFieldName}")
                : fullPath;

            // A nullable child-filter input can be supplied explicitly as null. Keep that
            // distinct from an omitted field and translate it to a Mongo null predicate.
            if (value is null)
            {
                if (!GraphQlTypeHelper.IsScalar(fieldDef.Type))
                    elements.Add(new BsonElement(dbFieldName, new BsonDocument("$eq", BsonNull.Value)));
                continue;
            }

            if (GraphQlTypeHelper.IsScalar(fieldDef.Type))
            {
                var opBson = ConvertScalarOperation(fieldDef.Type, dbFieldName, value);
                if (opBson != null)
                    elements.AddRange(opBson.Elements);
            }
            else
            {
                if (CoerceWhereDictionary(value) is null)
                    throw Invalid($"Field '{fullPath}' must be filtered using its child fields.");
                var nested = Convert(value, schema, fullPath);
                if (nested != null && nested.ElementCount > 0)
                {
                    if (nested.ElementCount == 1 && nested.GetElement(0).Name == "$and")
                    {
                        foreach (var clause in nested["$and"].AsBsonArray.Select(x => x.AsBsonDocument))
                            elements.Add(clause.GetElement(0));
                    }
                    else
                    {
                        elements.AddRange(nested.Elements);
                    }
                }
            }
        }

        if (elements.Count == 0) return null;
        if (elements.Count == 1) return new BsonDocument(elements[0].Name, elements[0].Value);
        return new BsonDocument("$and", new BsonArray(elements.Select(e => new BsonDocument(e.Name, e.Value))));
    }

    private static BsonElement? ConvertLogicalOperator(object value, SchemaDefinitionExtended schema, string mongoOp)
    {
        var items = CoerceList(value);
        if (items is null || items.Count == 0)
            return null;

        var clauses = new List<BsonDocument>();
        foreach (var item in items)
        {
            if (item == null) continue;
            var clause = Convert(item, schema, "");
            if (clause != null)
                clauses.Add(clause);
        }

        if (clauses.Count == 0) return null;
        return new BsonElement(mongoOp, new BsonArray(clauses));
    }

    private static List<object?>? CoerceList(object? value)
    {
        switch (value)
        {
            case null:
                return null;
            case IList<object?> typed:
                return [.. typed];
            case string:
                return null;
            case IEnumerable enumerable:
            {
                var list = new List<object?>();
                foreach (var item in enumerable)
                    list.Add(item);
                return list;
            }
            default:
                return null;
        }
    }

    private static BsonDocument? ConvertScalarOperation(string scalarType, string fieldName, object value)
    {
        var opDict = CoerceOperationDictionary(value);
        if (opDict is null)
            throw Invalid($"Scalar field '{fieldName}' must use an operation filter object.");
        if (opDict.Count == 0)
            return null;

        var allowedOps = GetAllowedOps(scalarType);
        var clauses = new List<BsonElement>();

        foreach (var op in opDict)
        {
            var opKey = op.Key;
            if (string.IsNullOrWhiteSpace(opKey) || !allowedOps.Contains(opKey))
                throw Invalid($"Unsupported or invalid operator: '{opKey}' for type {scalarType}.");

            var mongoOp = MapOperatorToMongo(opKey);
            BsonValue bsonVal;
            if (op.Value is null)
            {
                if (mongoOp is not ("$eq" or "$ne"))
                    throw Invalid($"Operator '{opKey}' does not support a null value.");
                bsonVal = BsonNull.Value;
            }
            else if (mongoOp == "$regex")
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

    private static IReadOnlyDictionary<string, object?>? CoerceOperationDictionary(object value)
    {
        switch (value)
        {
            case IReadOnlyDictionary<string, object?> roDict:
                return roDict;
            case IDictionary<string, object?> dict:
                return dict as IReadOnlyDictionary<string, object?>
                    ?? dict.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        }

        return CoerceFromClrObject(value);
    }

    private static IReadOnlyDictionary<string, object?>? CoerceWhereDictionary(object value)
    {
        if (value is IReadOnlyDictionary<string, object?> roDict)
            return roDict;
        if (value is IDictionary<string, object?> dict)
            return dict as IReadOnlyDictionary<string, object?>
                ?? dict.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);

        return CoerceFromClrObject(value);
    }

    private static IReadOnlyDictionary<string, object?>? CoerceFromClrObject(object? value)
    {
        if (value is null || value is string || value is IEnumerable || value.GetType().IsPrimitive)
            return null;

        var unwrapped = UnwrapOptional(value);
        if (unwrapped is null || unwrapped is string || unwrapped is IEnumerable || unwrapped.GetType().IsPrimitive)
            return null;
        if (unwrapped is IReadOnlyDictionary<string, object?> roDict)
            return roDict;
        if (unwrapped is IDictionary<string, object?> dict)
            return dict as IReadOnlyDictionary<string, object?>
                ?? dict.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);

        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in unwrapped.GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            if (prop.GetIndexParameters().Length > 0) continue;
            if (!seen.Add(prop.Name)) continue;

            object? propValue;
            try
            {
                propValue = prop.GetValue(unwrapped);
            }
            catch
            {
                continue;
            }

            // Hot Chocolate uses Optional<T> to preserve the difference between an
            // omitted operation and an explicitly supplied null operation value.
            var isOptional = IsOptional(propValue);
            if (isOptional && IsUnsetOptional(propValue))
                continue;
            if (!isOptional && propValue is null)
                continue;
            result[prop.Name] = UnwrapOptional(propValue);
        }

        return result.Count == 0 ? null : result;
    }

    private static bool IsUnsetOptional(object? value)
    {
        return IsOptional(value) && value!.GetType().GetProperty("HasValue")?.GetValue(value) is false;
    }

    private static bool IsOptional(object? value) =>
        value is not null &&
        value.GetType().IsGenericType &&
        value.GetType().GetGenericTypeDefinition() == typeof(Optional<>);

    private static object? UnwrapOptional(object? value)
    {
        while (value is not null)
        {
            var type = value.GetType();
            if (!type.IsGenericType || type.GetGenericTypeDefinition() != typeof(Optional<>))
                break;

            var hasValueProp = type.GetProperty("HasValue");
            var valueProp = type.GetProperty("Value");
            if (hasValueProp is null || valueProp is null)
                break;
            if (hasValueProp.GetValue(value) is not true)
                return null;
            value = valueProp.GetValue(value);
        }

        if (value is Optional<object?> optional)
            return optional.HasValue ? optional.Value : null;

        return value;
    }

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
            _ => throw Invalid($"Unsupported operator: '{opKey}'.")
        };
    }

    private static InvalidWhereFilterException Invalid(string message) => new(message);

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

public sealed class InvalidWhereFilterException(string message) : ArgumentException(message)
{
    public string Code => "INVALID_WHERE_FILTER";
}
