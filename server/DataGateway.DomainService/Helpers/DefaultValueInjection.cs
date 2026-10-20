using System.Collections;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Helpers;

public static class DefaultValueInjection
{
    public static readonly IReadOnlyDictionary<string, string> DefaultFieldDescriptions = FieldDefinitionMapper.DefaultFieldDescriptions;

    public static void AddDefaultFields(this SchemaDefinition schemaDefinition)
    {
        var existingFieldNames = new HashSet<string>(
            schemaDefinition.Fields.Select(field => field.Name),
            StringComparer.OrdinalIgnoreCase);

        var baseEntityFields = typeof(BaseEntity).GetProperties();
        foreach (var baseEntityField in baseEntityFields)
        {
            if (existingFieldNames.Contains(baseEntityField.Name))
                continue;

            var (graphQlType, isArray) = Describe(baseEntityField.PropertyType);

            schemaDefinition.Fields.Add(new FieldDefinition
            {
                Name = baseEntityField.Name,
                Type = graphQlType,
                IsArray = isArray,
                IsPIIData = false,
                IsUniqueData = false,
                Description = DefaultFieldDescriptions.TryGetValue(baseEntityField.Name, out var desc)
                    ? desc
                    : $"Default field from {nameof(BaseEntity)}",
            });

            existingFieldNames.Add(baseEntityField.Name);
        }
    }

    private static readonly IReadOnlyDictionary<string, string> InnerFieldDescriptions = new Dictionary<string, string>
    {
        [nameof(OperationAccess.Roles)] = "Roles allowed",
        [nameof(OperationAccess.UserIds)] = "Users allowed",
        [nameof(OperationAccess.Permissions)] = "Permissions allowed",
    };

    /// <summary>
    /// The base entity's own property of that name and type, as <see cref="AddDefaultFields"/> put it on the schema
    /// (e.g. Read: OperationAccess). Such a type is valid under that name only; it is not a type to give a new field.
    /// </summary>
    public static bool IsBaseEntityField(string? name, string? type) =>
        !string.IsNullOrWhiteSpace(name)
        && typeof(BaseEntity).GetProperty(name) is { } property
        && string.Equals(Describe(property.PropertyType).Type, type, StringComparison.Ordinal);

    /// <summary>
    /// The inner fields of a base entity object property (Create/Read/Update/Delete hold Roles, UserIds and
    /// Permissions), so they get flattened entries like a child schema's; empty for anything else.
    /// </summary>
    public static List<FieldDefinition> BaseEntityInnerFields(string name, string type)
    {
        if (!IsBaseEntityField(name, type) || typeof(BaseEntity).GetProperty(name) is not { } property)
            return [];
        var objectType = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
        if (!objectType.IsClass || objectType == typeof(string) || typeof(IEnumerable).IsAssignableFrom(objectType))
            return [];

        return objectType.GetProperties()
            .Where(p => p.CanWrite)
            .Select(p =>
            {
                var (innerType, isArray) = Describe(p.PropertyType);
                return new FieldDefinition
                {
                    Name = p.Name,
                    Type = innerType,
                    IsArray = isArray,
                    Description = InnerFieldDescriptions.GetValueOrDefault(p.Name, string.Empty),
                };
            })
            .ToList();
    }

    /// <summary>A CLR property type as a schema field: its scalar (or class) name, and whether it is a list.</summary>
    private static (string Type, bool IsArray) Describe(Type propertyType)
    {
        var type = Nullable.GetUnderlyingType(propertyType) ?? propertyType;
        if (type.IsArray)
            return (GraphQlTypeHelper.GetScalarType(type.GetElementType()!), true);
        if (type.IsGenericType
            && type.GetGenericArguments().Length == 1
            && typeof(IEnumerable).IsAssignableFrom(type)
            && type != typeof(string))
            return (GraphQlTypeHelper.GetScalarType(type.GetGenericArguments()[0]), true);
        return (GraphQlTypeHelper.GetScalarType(type), false);
    }
    public static void InjectDefaultValue<T>(this T entity) where T : GraphQlBaseEntity
    {
        var isInsertOperation = false;

        if (string.IsNullOrWhiteSpace(entity.ItemId))
        {
            entity.ItemId = Guid.NewGuid().ToString();
            isInsertOperation = true;
        }

        if (entity.CreatedDate == default)
        {
            entity.CreatedDate = DateTime.UtcNow;
        }

        entity.LastUpdatedDate = DateTime.UtcNow;

        var blocksCtx = BlocksContext.GetContext();
        if (blocksCtx is not null)
        {
            entity.CreatedBy = string.IsNullOrWhiteSpace(entity.CreatedBy) ? blocksCtx.UserId : entity.CreatedBy;
            entity.LastUpdatedBy = blocksCtx.UserId;
            entity.OrganizationId = isInsertOperation ? blocksCtx.OrganizationId : entity.OrganizationId;
        }

    }

    public static void InjectDefaultValueOnInsert(this Dictionary<string, object?> input)
    {
        input[GraphQlConstant.DbEntityIdFieldName] = SuppliedItemId(input) ?? Guid.NewGuid().ToString();
        input.Remove(nameof(GraphQlBaseEntity.ItemId));

        var nowDateTime = DateTime.UtcNow;
        input.Add(nameof(GraphQlBaseEntity.CreatedDate), nowDateTime);
        input.Add(nameof(GraphQlBaseEntity.LastUpdatedDate), nowDateTime);

        var blocksCtx = BlocksContext.GetContext();
        if (blocksCtx is not null)
        {
            input.Add(nameof(GraphQlBaseEntity.CreatedBy), blocksCtx.UserId);
            input.Add(nameof(GraphQlBaseEntity.LastUpdatedBy), blocksCtx.UserId);
            if (!input.ContainsKey(nameof(GraphQlBaseEntity.OrganizationId)))
            {
                input.Add(nameof(GraphQlBaseEntity.OrganizationId), blocksCtx.OrganizationId);
            }
        }
    }

    /// <summary>
    /// The id a client chose for the new row, or null. GraphQL input already carries it as <c>_id</c>
    /// (<see cref="GraphQlTypeHelper.MapMutationInput"/> renames ItemId); input built elsewhere may still
    /// use <c>ItemId</c>. A blank id counts as none.
    /// </summary>
    private static string? SuppliedItemId(Dictionary<string, object?> input)
    {
        foreach (var key in new[] { GraphQlConstant.DbEntityIdFieldName, nameof(GraphQlBaseEntity.ItemId) })
        {
            if (input.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value?.ToString()))
                return value.ToString();
        }
        return null;
    }

    public static void InjectDefaultValueOnUpdate(this Dictionary<string, object?> input)
    {
        input.Add(nameof(GraphQlBaseEntity.LastUpdatedDate), DateTime.UtcNow);
        var blocksCtx = BlocksContext.GetContext();
        if (blocksCtx is not null)
        {
            input.Add(nameof(GraphQlBaseEntity.LastUpdatedBy), blocksCtx.UserId);
        }
    }
}