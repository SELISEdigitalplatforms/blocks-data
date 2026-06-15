using System.Text.Json;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Coerces System.Text.Json-deserialized values into native CLR types
/// suitable for MongoDB and the existing business logic.
/// </summary>
public static class RestInputHelper
{
    /// <summary>
    /// Deep-converts a dictionary from REST JSON deserialization into
    /// native types using schema field definitions for type guidance.
    /// </summary>
    public static Dictionary<string, object?> CoerceInput(
        Dictionary<string, object?> input,
        SchemaDefinitionExtended schema)
    {
        var result = new Dictionary<string, object?>(input.Count);
        foreach (var (key, value) in input)
        {
            var fieldDef = schema.Fields.FirstOrDefault(f => f.Name == key);
            result[key] = CoerceValue(value, fieldDef?.Type, fieldDef?.IsArray ?? false);
        }
        return result;
    }

    /// <summary>
    /// Deep-converts any value from JSON deserialization into a native CLR type.
    /// </summary>
    public static object? CoerceValue(object? value, string? schemaType = null, bool isArray = false)
    {
        if (value is null)
            return null;

        if (value is JsonElement element)
            return CoerceJsonElement(element, schemaType, isArray);

        return value;
    }

    /// <summary>
    /// Recursively converts a JsonElement to the appropriate CLR type.
    /// </summary>
    public static object? CoerceJsonElement(JsonElement element, string? schemaType = null, bool isArray = false)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.Undefined:
                return null;

            case JsonValueKind.True:
                return true;

            case JsonValueKind.False:
                return false;

            case JsonValueKind.String:
                var str = element.GetString();
                if (schemaType == "DateTime" && DateTime.TryParse(str, out var dt))
                    return dt;
                return str;

            case JsonValueKind.Number:
                if (schemaType == "Int" && element.TryGetInt32(out var intVal))
                    return intVal;
                if (schemaType == "Int" && element.TryGetInt64(out var longVal))
                    return longVal;
                if (element.TryGetInt64(out var defaultLong))
                    return defaultLong;
                return element.GetDouble();

            case JsonValueKind.Array:
                var list = new List<object?>();
                foreach (var item in element.EnumerateArray())
                    list.Add(CoerceJsonElement(item, schemaType));
                return list;

            case JsonValueKind.Object:
                var dict = new Dictionary<string, object?>();
                foreach (var prop in element.EnumerateObject())
                    dict[prop.Name] = CoerceJsonElement(prop.Value);
                return dict;

            default:
                return element.ToString();
        }
    }

    /// <summary>
    /// Deep-converts a dictionary tree (where/order) that may contain JsonElement values.
    /// Unlike CoerceInput, this operates without schema type info — used for filter/sort objects.
    /// </summary>
    public static object? CoerceObjectTree(object? value)
    {
        if (value is null)
            return null;

        if (value is JsonElement element)
            return CoerceJsonElement(element);

        if (value is Dictionary<string, object?> dict)
        {
            var result = new Dictionary<string, object?>(dict.Count);
            foreach (var (key, v) in dict)
                result[key] = CoerceObjectTree(v);
            return result;
        }

        if (value is List<object?> list)
            return list.Select(CoerceObjectTree).ToList();

        return value;
    }
}
