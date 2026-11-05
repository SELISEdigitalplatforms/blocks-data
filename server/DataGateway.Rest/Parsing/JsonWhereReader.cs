using System.Text.Json;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Reads a REST <c>where</c> (the same shape as a GraphQL <c>where</c> variable) into the plain-value tree the
/// gateway engine takes, so <c>WhereToMongoFilterConverter</c> builds the same filter it builds for GraphQL.
///
/// Values are coerced by field type: DateTime from an ISO-8601 string with an offset or <c>Z</c> to a UTC
/// <see cref="DateTime"/> (<see cref="RestDateTime"/>), Int to <see cref="int"/> (out of range is a field error),
/// Float to <see cref="double"/>, Boolean to <see cref="bool"/>, Enum to the member name, GeoJSON operands to nested
/// dictionaries.
///
/// Stricter than GraphQL where GraphQL's types cannot be relied on: field and operator names match exactly
/// (case-sensitive); <c>and</c> / <c>or</c> are accepted only in lowercase, only on a filter object (the root, or an
/// item of an <c>and</c> / <c>or</c> list), and only as non-empty lists of filter objects; keys starting with
/// <c>$</c> are refused; nesting depth and the number of conditions are capped by <see cref="RestLimits"/>. Every
/// shape the converter would silently drop, and so widen the filter, is refused: a null field or operand, an empty
/// operation, DTO or <c>and</c> / <c>or</c> item, an <c>eq</c> / <c>neq</c> with an empty string, and an empty
/// <c>contains</c> / <c>startsWith</c> / <c>endsWith</c> pattern (which would match everything). At most one of
/// <c>contains</c> / <c>startsWith</c> / <c>endsWith</c> per field, since all three become the field's one
/// <c>$regex</c>.
/// </summary>
public static class JsonWhereReader
{
    private const string And = "and";
    private const string Or = "or";

    private static readonly string[] StringOps = ["eq", "neq", "contains", "startsWith", "endsWith", "in"];
    private static readonly string[] NumberOps = ["eq", "neq", "gt", "gte", "lt", "lte", "in"];
    private static readonly string[] BooleanOps = ["eq", "neq"];
    private static readonly string[] DateTimeOps = ["eq", "neq", "gt", "gte", "lt", "lte", "in"];
    private static readonly string[] GeoJsonOps = ["eq", "neq", "near", "within", "intersects"];
    private static readonly string[] EnumOps = ["eq", "neq", "in", "nin"];
    private static readonly string[] PatternOps = ["contains", "startsWith", "endsWith"];

    private static readonly string[] NearMembers = ["geometry", "maxDistanceMeters", "minDistanceMeters"];
    private static readonly string[] GeometryFilterMembers = ["geometry"];

    /// <summary>
    /// Reads <paramref name="where"/>. Null (or absent) and an empty object both mean no filter and return null.
    /// Throws <see cref="RestRequestException"/> for anything the filter cannot accept.
    /// </summary>
    public static WhereNode? Read(JsonElement where, EntityModel entity, RestLimits limits)
    {
        if (where.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        if (where.ValueKind != JsonValueKind.Object)
            throw new RestRequestException("'where' must be a JSON object.");

        var root = new Reader(entity, limits).ReadFilter(where, entity.Schema.Fields, prefix: "", depth: 1);
        return root.Count == 0 ? null : new WhereNode(root);
    }

    private sealed class Reader(EntityModel entity, RestLimits limits)
    {
        private int _conditions;

        /// <summary>
        /// A filter object: field names, and (at entity level only, <paramref name="prefix"/> empty) <c>and</c> /
        /// <c>or</c>. Inside a DTO object the converter would ignore them, so there they are unknown fields.
        /// </summary>
        public Dictionary<string, object?> ReadFilter(JsonElement filter, IList<FieldDefinitionResponse> fields, string prefix, int depth)
        {
            if (depth > limits.MaxWhereDepth)
                throw new RestRequestException($"The where filter is nested more than {limits.MaxWhereDepth} levels deep.");

            var allowLogical = prefix.Length == 0;
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var property in filter.EnumerateObject())
            {
                var key = JsonText.Name(property, prefix);
                var path = FieldPaths.Join(prefix, key);
                CheckKey(result, key, path, path);

                if (allowLogical && key is And or Or)
                {
                    result[key] = ReadLogical(property.Value, key, depth);
                    continue;
                }

                var field = FieldPaths.Find(fields, key) ?? throw FieldPaths.UnknownField(path, Suggest(fields, key, prefix, allowLogical));
                result[key] = ReadField(field, property.Value, path, prefix, depth);
            }
            return result;
        }

        private static string? Suggest(IList<FieldDefinitionResponse> fields, string key, string prefix, bool allowLogical)
        {
            if (FieldPaths.FindIgnoringCase(fields, key) is { } match)
                return FieldPaths.Join(prefix, match.Name);
            if (allowLogical && key.Equals(And, StringComparison.OrdinalIgnoreCase))
                return And;
            if (allowLogical && key.Equals(Or, StringComparison.OrdinalIgnoreCase))
                return Or;
            return null;
        }

        private List<object?> ReadLogical(JsonElement value, string key, int depth)
        {
            if (value.ValueKind != JsonValueKind.Array)
                throw new RestRequestException($"'{key}' must be a list of filter objects.");
            // The converter drops an empty list, and an empty item, without a trace: the filter would widen.
            if (value.GetArrayLength() == 0)
                throw new RestRequestException($"'{key}' must contain at least one filter object.");

            var items = new List<object?>();
            foreach (var item in value.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    throw new RestRequestException($"Each item in '{key}' must be a filter object.");
                if (IsEmptyObject(item))
                    throw new RestRequestException($"Each item in '{key}' needs at least one condition.");
                items.Add(ReadFilter(item, entity.Schema.Fields, prefix: "", depth + 1));
            }
            return items;
        }

        /// <summary>
        /// A field's filter. Every shape the converter would silently drop (null, an empty operation or DTO object)
        /// is refused, so a filter can never quietly match more than it says.
        /// </summary>
        private object? ReadField(FieldDefinitionResponse field, JsonElement value, string path, string prefix, int depth)
        {
            if (value.ValueKind == JsonValueKind.Null)
                throw RestRequestException.ForField(path, $"Field '{path}' must be a filter object, not null.", FieldPaths.InvalidValueType);

            if (SchemaTypeHelper.IsScalar(field.Type))
            {
                if (value.ValueKind != JsonValueKind.Object)
                    throw RestRequestException.ForField(path,
                        $"Field '{path}' must be filtered with an operator object, such as {{ \"eq\": value }}.", FieldPaths.InvalidValueType);
                if (IsEmptyObject(value))
                    throw RestRequestException.ForField(path, $"Field '{path}' needs at least one operator.", FieldPaths.InvalidValueType);
                return ReadOperations(field, value, path);
            }

            // As GraphQL's filter types: a DTO is filtered through the fields the entity carries for it, and the base
            // entity's access lists (Create, Read, ...) have no filter at all.
            var filterable = field.Fields is { Count: > 0 }
                && !(prefix.Length == 0 && DefaultValueInjection.IsBaseEntityField(field.Name, field.Type));
            if (!filterable)
                throw RestRequestException.ForField(path, $"Field '{path}' cannot be filtered.", FieldPaths.InvalidValueType);
            if (value.ValueKind != JsonValueKind.Object)
                throw RestRequestException.ForField(path, $"Field '{path}' must be filtered using its child fields.", FieldPaths.InvalidValueType);
            if (IsEmptyObject(value))
                throw RestRequestException.ForField(path, $"Field '{path}' needs at least one condition.", FieldPaths.InvalidValueType);

            return ReadFilter(value, field.Fields, path, depth + 1);
        }

        private Dictionary<string, object?> ReadOperations(FieldDefinitionResponse field, JsonElement operations, string path)
        {
            var allowed = OperatorsFor(field.Type);
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);
            var hasPatternOperator = false;
            foreach (var property in operations.EnumerateObject())
            {
                var op = JsonText.Name(property, path);
                CheckKey(result, op, path, $"{path}.{op}");
                if (!allowed.Contains(op, StringComparer.Ordinal))
                    throw RestRequestException.ForField(path,
                        $"Unknown operator '{op}' for field '{path}'. Allowed operators: {string.Join(", ", allowed)}.",
                        FieldPaths.UnknownOperatorType);

                // contains / startsWith / endsWith all become $regex on the field: the converter cannot hold two.
                if (PatternOps.Contains(op, StringComparer.Ordinal))
                {
                    if (hasPatternOperator)
                        throw RestRequestException.ForField(path,
                            "Only one of 'contains', 'startsWith' or 'endsWith' may be used on a field; combine conditions with 'and'.",
                            FieldPaths.UnknownOperatorType);
                    hasPatternOperator = true;
                }

                if (++_conditions > limits.MaxWhereConditions)
                    throw new RestRequestException($"The where filter has more than {limits.MaxWhereConditions} conditions.");

                // The converter skips a null operand and an empty-string eq; either would drop the condition.
                if (property.Value.ValueKind == JsonValueKind.Null)
                    throw RestRequestException.ForField(path,
                        $"Operator '{op}' on '{path}' needs a value; null is not supported.", FieldPaths.InvalidValueType);
                if (op is "eq" or "neq" && IsStringValued(field.Type)
                    && property.Value.ValueKind == JsonValueKind.String && JsonText.String(property.Value, path).Length == 0)
                    throw RestRequestException.ForField(path,
                        $"Operator '{op}' on '{path}' cannot compare with an empty string.", FieldPaths.InvalidValueType);
                // An empty pattern is an empty regex, which matches every record.
                if (PatternOps.Contains(op, StringComparer.Ordinal)
                    && property.Value.ValueKind == JsonValueKind.String && JsonText.String(property.Value, path).Length == 0)
                    throw RestRequestException.ForField(path,
                        $"Operator '{op}' on '{path}' cannot use an empty string.", FieldPaths.InvalidValueType);

                result[op] = ReadOperand(field, op, property.Value, path);
            }
            return result;
        }

        private static bool IsEmptyObject(JsonElement element) => !element.EnumerateObject().Any();

        /// <summary>Field types whose operands are strings: String, ID, any other plain scalar, and Enum.</summary>
        private static bool IsStringValued(string type)
            => type is not ("Int" or "Float" or "Boolean" or "DateTime" or GeoJsonValidator.TypeName);

        private static void CheckKey(Dictionary<string, object?> read, string key, string field, string shownAs)
        {
            if (key.StartsWith('$'))
                throw RestRequestException.ForField(field, $"Key '{shownAs}' is not allowed: keys starting with '$' are refused.", FieldPaths.InvalidKeyType);
            if (read.ContainsKey(key))
                throw RestRequestException.ForField(field, $"Key '{shownAs}' was given more than once.", FieldPaths.InvalidKeyType);
        }
    }

    private static string[] OperatorsFor(string type) => type switch
    {
        "Int" or "Float" => NumberOps,
        "Boolean" => BooleanOps,
        "DateTime" => DateTimeOps,
        GeoJsonValidator.TypeName => GeoJsonOps,
        SchemaTypeHelper.EnumTypeName => EnumOps,
        _ => StringOps
    };

    private static object? ReadOperand(FieldDefinitionResponse field, string op, JsonElement value, string path)
    {
        if (op is "in" or "nin")
        {
            if (value.ValueKind != JsonValueKind.Array)
                throw RestRequestException.ForField(path, $"Operator '{op}' on field '{path}' expects a list.", FieldPaths.InvalidValueType);
            return value.EnumerateArray()
                .Select(item => item.ValueKind == JsonValueKind.Null ? null : ReadScalar(field, item, path))
                .ToList();
        }

        return op switch
        {
            "near" => ReadGeometryFilter(value, path, op, NearMembers),
            "within" or "intersects" => ReadGeometryFilter(value, path, op, GeometryFilterMembers),
            _ => ReadScalar(field, value, path)
        };
    }

    /// <summary>A scalar value coerced by the field's type; shared with <see cref="JsonRecordReader"/> so a record and a filter read values alike.</summary>
    internal static object ReadScalar(FieldDefinitionResponse field, JsonElement value, string path)
    {
        switch (field.Type)
        {
            case "Int":
                if (value.ValueKind == JsonValueKind.Number)
                {
                    if (value.TryGetInt32(out var number))
                        return number;
                    if (IsWholeNumber(value))
                        throw RestRequestException.ForField(path,
                            $"Value {value.GetRawText()} for field '{path}' is outside the Int range.", FieldPaths.InvalidValueType);
                }
                throw Expected(path, "a whole number (Int)");

            case "Float":
                if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var real) && double.IsFinite(real))
                    return real;
                throw Expected(path, "a number");

            case "Boolean":
                return value.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => throw Expected(path, "true or false")
                };

            case "DateTime":
                if (value.ValueKind == JsonValueKind.String && RestDateTime.TryParse(JsonText.String(value, path), out var date))
                    return date;
                throw Expected(path, "an ISO-8601 date-time with an offset or 'Z'");

            case GeoJsonValidator.TypeName:
                return value.ValueKind == JsonValueKind.Object
                    ? PlainValue(value, path)!
                    : throw Expected(path, "a GeoJSON geometry object");

            case SchemaTypeHelper.EnumTypeName:
                if (value.ValueKind != JsonValueKind.String)
                    throw Expected(path, "an enum value name");
                var member = JsonText.String(value, path);
                if (field.EnumValues is { Count: > 0 } members && !members.Contains(member, StringComparer.Ordinal))
                    throw RestRequestException.ForField(path,
                        $"'{member}' is not a value of field '{path}'. Allowed values: {string.Join(", ", members)}.", FieldPaths.InvalidValueType);
                return member;

            default:
                return value.ValueKind == JsonValueKind.String ? JsonText.String(value, path) : throw Expected(path, "a string");
        }
    }

    /// <summary>An integer literal (no fraction or exponent), however large.</summary>
    private static bool IsWholeNumber(JsonElement number)
    {
        var raw = number.GetRawText();
        return raw.IndexOfAny(['.', 'e', 'E']) < 0;
    }

    /// <summary>
    /// A <c>near</c> (<c>geometry</c>, <c>maxDistanceMeters</c>, optional <c>minDistanceMeters</c>) or
    /// <c>within</c> / <c>intersects</c> (<c>geometry</c>) operand, with the members GraphQL's input types declare.
    /// The geometry and distances themselves are validated by the converter, as for GraphQL.
    /// </summary>
    private static Dictionary<string, object?> ReadGeometryFilter(JsonElement value, string path, string op, string[] members)
    {
        if (value.ValueKind != JsonValueKind.Object)
            throw RestRequestException.ForField(path, $"Operator '{op}' on field '{path}' expects an object with a 'geometry'.", FieldPaths.InvalidValueType);

        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in value.EnumerateObject())
        {
            var name = JsonText.Name(property, path);
            if (!members.Contains(name, StringComparer.Ordinal))
                throw RestRequestException.ForField(path,
                    $"Unknown property '{name}' in '{op}' on field '{path}'. Allowed: {string.Join(", ", members)}.", FieldPaths.InvalidKeyType);
            if (result.ContainsKey(name))
                throw RestRequestException.ForField(path, $"Property '{name}' in '{op}' on field '{path}' was given more than once.", FieldPaths.InvalidKeyType);
            if (property.Value.ValueKind == JsonValueKind.Null)
                continue;

            if (name == "geometry")
            {
                if (property.Value.ValueKind != JsonValueKind.Object)
                    throw Expected(path, "a GeoJSON geometry object in 'geometry'");
                result[name] = PlainValue(property.Value, path);
            }
            else
            {
                if (property.Value.ValueKind != JsonValueKind.Number || !property.Value.TryGetDouble(out var meters) || !double.IsFinite(meters))
                    throw Expected(path, $"a number in '{op}.{name}'");
                result[name] = meters;
            }
        }

        if (!result.ContainsKey("geometry") || (op == "near" && !result.ContainsKey("maxDistanceMeters")))
            throw RestRequestException.ForField(path,
                op == "near"
                    ? $"Operator 'near' on field '{path}' needs 'geometry' and 'maxDistanceMeters'."
                    : $"Operator '{op}' on field '{path}' needs 'geometry'.",
                FieldPaths.InvalidValueType);
        return result;
    }

    /// <summary>
    /// A GeoJSON value as plain values, the way GraphQL parses an object literal: objects become dictionaries, arrays
    /// lists, integers <see cref="int"/> (<see cref="long"/> when larger), other numbers <see cref="double"/>.
    /// </summary>
    internal static object? PlainValue(JsonElement value, string path)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var dictionary = new Dictionary<string, object?>(StringComparer.Ordinal);
                foreach (var property in value.EnumerateObject())
                {
                    var name = JsonText.Name(property, path);
                    if (name.StartsWith('$') || !dictionary.TryAdd(name, PlainValue(property.Value, path)))
                        throw RestRequestException.ForField(path,
                            $"Invalid or repeated key '{name}' in the GeoJSON value of field '{path}'.", FieldPaths.InvalidKeyType);
                }
                return dictionary;
            case JsonValueKind.Array:
                return value.EnumerateArray().Select(item => PlainValue(item, path)).ToList();
            case JsonValueKind.String:
                return JsonText.String(value, path);
            case JsonValueKind.Number:
                if (value.TryGetInt32(out var i)) return i;
                if (value.TryGetInt64(out var l)) return l;
                return value.GetDouble();
            case JsonValueKind.True:
                return true;
            case JsonValueKind.False:
                return false;
            default:
                return null;
        }
    }

    internal static RestRequestException Expected(string path, string what)
        => RestRequestException.ForField(path, $"Field '{path}' expects {what}.", FieldPaths.InvalidValueType);
}
