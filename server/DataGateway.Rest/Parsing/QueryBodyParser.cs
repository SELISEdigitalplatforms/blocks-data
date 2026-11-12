using System.Text.Json;
using DataGateway.DomainService.Gateway;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Reads a list request's body (<c>POST /api/gateway/{entity}:query</c>):
/// <c>{ "where": {…}, "order": [{ "field", "direction" }], "select": [paths], "paging": { "pageNo", "pageSize" },
/// "includeTotalCount": bool }</c>. Every member is optional and <c>null</c> means not given. Unknown or repeated
/// property names (case-sensitive) are refused, as in the query string.
/// </summary>
public static class QueryBodyParser
{
    private const string OrderShape = "'order' must be a list of { \"field\", \"direction\" } objects.";

    public static RestQueryOptions Parse(JsonElement body, EntityModel entity, RestLimits limits)
    {
        if (body.ValueKind != JsonValueKind.Object)
            throw new RestRequestException("The request body must be a JSON object.");

        WhereNode? where = null;
        IReadOnlyList<OrderItem>? order = null;
        IReadOnlyList<string> select = [];
        var pageNo = 1;
        var pageSize = limits.DefaultPageSize;
        var includeTotalCount = false;

        foreach (var property in UniqueProperties(body, null))
        {
            var value = property.Value;
            switch (property.Name)
            {
                case "where":
                    where = JsonWhereReader.Read(value, entity, limits);
                    break;
                case "order":
                    order = ReadOrder(value, entity);
                    break;
                case "select":
                    select = ReadSelect(value, entity);
                    break;
                case "paging":
                    (pageNo, pageSize) = ReadPaging(value, limits);
                    break;
                case "includeTotalCount":
                    includeTotalCount = value.ValueKind switch
                    {
                        JsonValueKind.True => true,
                        JsonValueKind.False or JsonValueKind.Null => false,
                        _ => throw ListQueryRules.NotABoolean("includeTotalCount")
                    };
                    break;
                default:
                    throw new RestRequestException($"Unknown property '{property.Name}'.");
            }
        }

        ListQueryRules.CheckPaging(pageNo, pageSize, limits);
        return new RestQueryOptions(where, order, pageNo, pageSize, select, includeTotalCount);
    }

    private static IReadOnlyList<OrderItem>? ReadOrder(JsonElement value, EntityModel entity)
    {
        if (value.ValueKind == JsonValueKind.Null)
            return null;
        if (value.ValueKind != JsonValueKind.Array)
            throw new RestRequestException(OrderShape);

        var entries = new List<(string Field, string? Direction)>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new RestRequestException(OrderShape);

            string? field = null;
            string? direction = null;
            foreach (var property in UniqueProperties(item, "order"))
            {
                switch (property.Name)
                {
                    case "field" when property.Value.ValueKind == JsonValueKind.String:
                        field = JsonText.String(property.Value, "order.field");
                        break;
                    case "direction" when property.Value.ValueKind is JsonValueKind.String or JsonValueKind.Null:
                        direction = property.Value.ValueKind == JsonValueKind.String ? JsonText.String(property.Value, "order.direction") : null;
                        break;
                    case "field" or "direction":
                        throw new RestRequestException($"'{property.Name}' in 'order' must be a string.");
                    default:
                        throw new RestRequestException($"Unknown property '{property.Name}' in 'order'.");
                }
            }

            if (string.IsNullOrWhiteSpace(field))
                throw new RestRequestException("Each 'order' entry needs a 'field'.");
            entries.Add((field, direction));
        }
        return ListQueryRules.Order(entity, entries);
    }

    private static IReadOnlyList<string> ReadSelect(JsonElement value, EntityModel entity)
    {
        if (value.ValueKind == JsonValueKind.Null)
            return [];
        if (value.ValueKind != JsonValueKind.Array || value.EnumerateArray().Any(item => item.ValueKind != JsonValueKind.String))
            throw new RestRequestException("'select' must be a list of field paths.");
        return ListQueryRules.Select(entity, value.EnumerateArray().Select(item => JsonText.String(item, "select")));
    }

    private static (int PageNo, int PageSize) ReadPaging(JsonElement value, RestLimits limits)
    {
        var pageNo = 1;
        var pageSize = limits.DefaultPageSize;
        if (value.ValueKind == JsonValueKind.Null)
            return (pageNo, pageSize);
        if (value.ValueKind != JsonValueKind.Object)
            throw new RestRequestException("'paging' must be an object with 'pageNo' and 'pageSize'.");

        foreach (var property in UniqueProperties(value, "paging"))
        {
            switch (property.Name)
            {
                case "pageNo":
                    pageNo = ReadInt(property.Value, "pageNo") ?? pageNo;
                    break;
                case "pageSize":
                    pageSize = ReadInt(property.Value, "pageSize") ?? pageSize;
                    break;
                default:
                    throw new RestRequestException($"Unknown property '{property.Name}' in 'paging'.");
            }
        }
        return (pageNo, pageSize);
    }

    private static int? ReadInt(JsonElement value, string name)
    {
        if (value.ValueKind == JsonValueKind.Null)
            return null;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
            ? number
            : throw ListQueryRules.NotAWholeNumber(name);
    }

    /// <summary>The object's properties, refusing a name given twice (JSON allows it; the last would silently win).</summary>
    private static IEnumerable<JsonProperty> UniqueProperties(JsonElement element, string? within)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            var name = JsonText.Name(property, within ?? "");
            if (!seen.Add(name))
                throw new RestRequestException(within is null
                    ? $"Property '{name}' was given more than once."
                    : $"Property '{name}' in '{within}' was given more than once.");
            yield return property;
        }
    }
}
