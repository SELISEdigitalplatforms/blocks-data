using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Converts BSON documents and values to .NET objects (e.g. for event payloads).
/// </summary>
public static class BsonConversionHelper
{
    /// <summary>
    /// Converts a BsonDocument to a dictionary of string to object for serialization.
    /// </summary>
    public static Dictionary<string, object?> BsonDocumentToDictionary(BsonDocument doc)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var element in doc.Elements)
            dict[element.Name] = BsonValueToObject(element.Value);
        return dict;
    }

    /// <summary>
    /// Converts a BsonValue to a CLR object (string, int, list, nested dict, etc.).
    /// </summary>
    public static object? BsonValueToObject(BsonValue value)
    {
        if (value == null || value.IsBsonNull) return null;
        return value.BsonType switch
        {
            BsonType.String => value.AsString,
            BsonType.Int32 => value.AsInt32,
            BsonType.Int64 => value.AsInt64,
            BsonType.Double => value.AsDouble,
            BsonType.Boolean => value.AsBoolean,
            BsonType.DateTime => value.ToUniversalTime(),
            BsonType.ObjectId => value.AsObjectId.ToString(),
            BsonType.Array => value.AsBsonArray.Select(BsonValueToObject).ToList(),
            BsonType.Document => BsonDocumentToDictionary(value.AsBsonDocument),
            BsonType.Decimal128 => value.AsDecimal128.ToString(),
            _ => value.ToString()
        };
    }
}
