using System.Text.Json;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Reads a REST record body (insert, update, insertMany) into the plain-value dictionary the gateway engine takes, the
/// one <c>GraphQlTypeHelper.MapMutationInput</c> builds for the same input, so the engine validates and writes it
/// exactly as it does for GraphQL.
///
/// Values are coerced by field type as in <see cref="JsonWhereReader"/>: String and ID from a string, Int from an
/// integer in <see cref="int"/> range (beyond it is a field error), Float to <see cref="double"/>, Boolean, DateTime
/// from ISO-8601 with an offset or <c>Z</c> to a UTC <see cref="DateTime"/> (<see cref="RestDateTime"/>), Enum from a
/// member name (case-sensitive), GeoJSON checked by <see cref="GeoJsonValidator"/>, a DTO as a nested dictionary read
/// with the DTO's own fields (its schema in <see cref="EntityModel.Dtos"/>, as GraphQL builds its input), an array as a list. An <c>ItemId</c> becomes <c>_id</c>, at every level.
///
/// Stricter than GraphQL where GraphQL's input types cannot be relied on: an unknown field is refused (GraphQL skips
/// it), a base-entity field the gateway stamps itself is refused (<see cref="WritableFields"/>), and field names match
/// case-sensitively with a "Did you mean" suggestion. A property given twice is refused, and so is a body nested more
/// than <see cref="MaxDepth"/> levels. A field whose value is <c>null</c> is dropped, at the top level and inside DTOs,
/// as <c>MapMutationInput</c> only adds non-null values; a null item inside a list of scalars is kept, as GraphQL
/// keeps it, and a null item in a list of DTOs is refused (GraphQL would turn it into an empty object). A null DTO
/// field is dropped here, where GraphQL turns it into an empty object: an intentional difference.
/// </summary>
public static class JsonRecordReader
{
    /// <summary>The deepest a body may nest (the body itself is level 1).</summary>
    public const int MaxDepth = 32;

    /// <summary>The validation type of a field error for a field that exists but may not be written.</summary>
    public const string NotWritableType = "NotWritable";

    /// <summary>
    /// Reads one record. Throws <see cref="RestRequestException"/> (with field errors where the problem belongs to a
    /// field) for anything the engine could not take as a record of <paramref name="entity"/>.
    /// </summary>
    public static Dictionary<string, object?> Read(JsonElement body, EntityModel entity, WriteOperation operation)
    {
        if (body.ValueKind != JsonValueKind.Object)
            throw new RestRequestException("The request body must be a JSON object.");
        CheckDepth(body, 1);
        return ReadRecord(body, entity.Schema.Fields, entity, prefix: "", operation);
    }

    /// <summary>
    /// Reads a list of records for a bulk insert: a non-empty array of at most <paramref name="maxItems"/> objects. A
    /// problem in one record names its position: the field becomes <c>[2].Name</c>.
    /// </summary>
    public static List<Dictionary<string, object?>> ReadMany(JsonElement body, EntityModel entity, int maxItems)
    {
        if (body.ValueKind != JsonValueKind.Array)
            throw new RestRequestException("The request body must be a JSON array of records.");
        var count = body.GetArrayLength();
        if (count == 0)
            throw new RestRequestException("The request body must contain at least one record.");
        if (count > maxItems)
            throw new RestRequestException($"The request body has {count} records; at most {maxItems} are accepted.");
        CheckDepth(body, 1);

        var records = new List<Dictionary<string, object?>>(count);
        var index = 0;
        foreach (var item in body.EnumerateArray())
        {
            try
            {
                if (item.ValueKind != JsonValueKind.Object)
                    throw new RestRequestException("Each record must be a JSON object.");
                records.Add(ReadRecord(item, entity.Schema.Fields, entity, prefix: "", WriteOperation.Insert));
            }
            catch (RestRequestException ex)
            {
                throw AtItem(ex, index);
            }
            index++;
        }
        return records;
    }

    /// <summary>The same exception with the record's position in the message and in each field error's path.</summary>
    private static RestRequestException AtItem(RestRequestException ex, int index)
    {
        var message = $"Item {index}: {ex.Message}";
        var errors = ex.Errors?
            .Select(e => new GatewayFieldError($"[{index}].{e.Field}", $"Item {index}: {e.Message}", e.ValidationType))
            .ToList();
        return new RestRequestException(message, errors);
    }

    /// <summary>
    /// Refuses a body nested deeper than <see cref="MaxDepth"/>. Stops at the first level past the limit, so a body
    /// the caller's parser let through at a higher depth cannot overflow the stack here.
    /// </summary>
    private static void CheckDepth(JsonElement element, int depth)
    {
        if (element.ValueKind is not (JsonValueKind.Object or JsonValueKind.Array))
            return;
        if (depth > MaxDepth)
            throw new RestRequestException($"The request body is nested more than {MaxDepth} levels deep.");

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
                CheckDepth(item, depth + 1);
        }
        else
        {
            foreach (var property in element.EnumerateObject())
                CheckDepth(property.Value, depth + 1);
        }
    }

    /// <summary>
    /// An object's fields. <paramref name="operation"/> is set for the entity's own fields only: the base-entity
    /// rule decides which of those may be written, and a DTO's fields are all the DTO's own.
    /// </summary>
    private static Dictionary<string, object?> ReadRecord(JsonElement element, IList<FieldDefinitionResponse> fields, EntityModel entity, string prefix, WriteOperation? operation)
    {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            var name = JsonText.Name(property, prefix);
            var path = FieldPaths.Join(prefix, name);
            if (!seen.Add(name))
                throw RestRequestException.ForField(path, $"Field '{path}' was given more than once.", FieldPaths.InvalidKeyType);

            var field = FieldPaths.Find(fields, name)
                ?? throw FieldPaths.UnknownField(path, SuggestionFor(fields, name, prefix));
            if (operation is { } op && !WritableFields.IsWritable(field.Name, op))
                throw RestRequestException.ForField(path,
                    $"Field '{path}' cannot be set on {(op == WriteOperation.Insert ? "insert" : "update")}.", NotWritableType);

            // As MapMutationInput, which only adds non-null values: a null field is absent from the record. The name has
            // been checked above, so a null is still refused for an unknown or read-only field.
            if (property.Value.ValueKind == JsonValueKind.Null)
                continue;

            // At every level, as MapMutationInput renames in each object it maps (a DTO with its own ItemId field too).
            var key = name == nameof(GraphQlBaseEntity.ItemId) ? GraphQlConstant.DbEntityIdFieldName : name;
            result[key] = ReadValue(field, property.Value, path, entity);
        }
        return result;
    }

    private static string? SuggestionFor(IList<FieldDefinitionResponse> fields, string name, string prefix)
        => FieldPaths.FindIgnoringCase(fields, name) is { } match ? FieldPaths.Join(prefix, match.Name) : null;

    private static object ReadValue(FieldDefinitionResponse field, JsonElement value, string path, EntityModel entity)
    {
        if (!field.IsArray)
            return ReadElement(field, value, path, entity);

        if (value.ValueKind != JsonValueKind.Array)
            throw JsonWhereReader.Expected(path, "an array");
        var items = new List<object?>(value.GetArrayLength());
        var index = 0;
        foreach (var item in value.EnumerateArray())
        {
            var itemPath = $"{path}[{index++}]";
            // A null in a list of scalars is kept as GraphQL keeps it. A DTO has no null form: GraphQL turns it into an
            // empty object, which would store a record the caller never sent.
            if (item.ValueKind == JsonValueKind.Null && SchemaTypeHelper.IsScalar(field.Type))
                items.Add(null);
            else if (item.ValueKind == JsonValueKind.Null)
                throw RestRequestException.ForField(itemPath, $"Field '{itemPath}' must be an object, not null.", FieldPaths.InvalidValueType);
            else
                items.Add(ReadElement(field, item, itemPath, entity));
        }
        return items;
    }

    /// <summary>One value of the field's type (an array's item, or the field itself when it is not an array).</summary>
    private static object ReadElement(FieldDefinitionResponse field, JsonElement value, string path, EntityModel entity)
    {
        if (SchemaTypeHelper.IsScalar(field.Type))
        {
            var scalar = JsonWhereReader.ReadScalar(field, value, path);
            if (field.Type == GeoJsonValidator.TypeName)
                ValidateGeoJson(scalar, path);
            return scalar;
        }

        // Without the DTO's fields there is nothing to check the object against (GraphQL has no input for it either).
        var children = ChildrenForWrite(field, entity)
            ?? throw RestRequestException.ForField(path, $"Field '{path}' cannot be set.", NotWritableType);
        if (value.ValueKind != JsonValueKind.Object)
            throw JsonWhereReader.Expected(path, "an object");
        return ReadRecord(value, children, entity, path, operation: null);
    }

    /// <summary>
    /// The fields a DTO value may carry: its schema in <see cref="EntityModel.Dtos"/> when present, because GraphQL
    /// builds <c>{Type}Input</c> from that schema; the entity's inline rows for the field only when the view has no
    /// schema for the type.
    /// </summary>
    private static IList<FieldDefinitionResponse>? ChildrenForWrite(FieldDefinitionResponse field, EntityModel entity)
        => entity.Dtos is not null && entity.Dtos.TryGetValue(field.Type, out var dto) && dto.Fields is { Count: > 0 }
            ? dto.Fields
            : FieldPaths.ChildrenOf(field, entity);

    private static void ValidateGeoJson(object geometry, string path)
    {
        try
        {
            GeoJsonValidator.Validate(geometry);
        }
        catch (GeoJsonValidationException ex)
        {
            throw RestRequestException.ForField(path, ex.ToFieldMessage(path), FieldPaths.InvalidValueType);
        }
    }
}
