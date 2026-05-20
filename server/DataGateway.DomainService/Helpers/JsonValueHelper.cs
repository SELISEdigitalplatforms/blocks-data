using System.Text.Json;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Converts JSON-deserialized values (e.g. JsonElement from object properties) to
/// primitive types that serialize correctly to MongoDB BSON.
/// </summary>
public static class JsonValueHelper
{
    /// <summary>
    /// Converts a value that may be a JsonElement (from System.Text.Json when deserializing to object)
    /// into a primitive type suitable for MongoDB storage. Leaves other types unchanged.
    /// </summary>
    public static object? ToStorableValue(object? value)
    {
        if (value is JsonElement jsonElement)
        {
            return jsonElement.ValueKind switch
            {
                JsonValueKind.String => jsonElement.GetString(),
                JsonValueKind.Number => jsonElement.TryGetInt64(out var l) ? l : jsonElement.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                JsonValueKind.Array => ConvertJsonArray(jsonElement),
                JsonValueKind.Object => jsonElement.GetRawText(),
                _ => value
            };
        }
        return value;
    }

    private static object?[] ConvertJsonArray(JsonElement jsonElement)
    {
        var list = new List<object?>();
        foreach (var item in jsonElement.EnumerateArray())
        {
            list.Add(ToStorableValue(item));
        }
        return list.ToArray();
    }
}
