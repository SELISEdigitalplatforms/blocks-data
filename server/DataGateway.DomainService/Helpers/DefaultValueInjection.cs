using System.Collections;
using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Helpers;

public static class DefaultValueInjection
{
    public static readonly IReadOnlyDictionary<string, string> DefaultFieldDescriptions = new Dictionary<string, string>
    {
        [nameof(GraphQlBaseEntity.ItemId)] = "Unique identifier for the record. System-generated and immutable once created.",
        [nameof(GraphQlBaseEntity.CreatedDate)] = "UTC timestamp when the record was first created. Automatically set on insert and never changed afterward.",
        [nameof(GraphQlBaseEntity.LastUpdatedDate)] = "UTC timestamp of the most recent update to the record. Automatically refreshed on every write operation.",
        [nameof(GraphQlBaseEntity.CreatedBy)] = "User ID of the person who originally created the record. Derived from the authentication context at insert time.",
        [nameof(GraphQlBaseEntity.LastUpdatedBy)] = "User ID of the person who last modified the record. Automatically updated from the authentication context on every write.",
        [nameof(GraphQlBaseEntity.OrganizationId)] = "List of organization IDs this record belongs to. Used for multi-tenancy and access-control scoping.",
        [nameof(GraphQlBaseEntity.Language)] = "Language code (e.g. 'en', 'de') that indicates the locale of the record. Used for localization and language-based content filtering.",
        [nameof(GraphQlBaseEntity.Tags)] = "List of tags associated with the record. Used for categorization, search, and filtering across queries.",
    };

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

            var propertyType = baseEntityField.PropertyType;
            bool isArray = false;

            if (Nullable.GetUnderlyingType(propertyType) != null)
            {
                propertyType = Nullable.GetUnderlyingType(propertyType);
            }
            Type elementType = propertyType;

            if (propertyType.IsArray)
            {
                elementType = propertyType.GetElementType();
                isArray = true;
            }
            else if (propertyType.IsGenericType
            && propertyType.GetGenericArguments().Length == 1
            && typeof(IEnumerable).IsAssignableFrom(propertyType)
            && propertyType != typeof(string))
            {
                elementType = propertyType.GetGenericArguments()[0];
                isArray = true;
            }

            var graphQlType = GraphQlTypeHelper.GetScalarType(elementType);

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

        if (input.TryGetValue(nameof(GraphQlBaseEntity.ItemId), out var value))
        {
            var itemId = value is null ? Guid.NewGuid().ToString() :
                string.IsNullOrWhiteSpace(value.ToString()) ? Guid.NewGuid().ToString() : value.ToString();
            input.Add(GraphQlConstant.DbEntityIdFieldName, itemId);
            input.Remove(nameof(GraphQlBaseEntity.ItemId));
        }
        else
        {
            input.Add(GraphQlConstant.DbEntityIdFieldName, Guid.NewGuid().ToString());
        }
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