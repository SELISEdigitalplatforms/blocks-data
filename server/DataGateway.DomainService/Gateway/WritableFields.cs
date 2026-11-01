using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Gateway;

public enum WriteOperation
{
    Insert,
    Update
}

/// <summary>
/// The rule for which fields a caller may supply on a write. A field is writable unless it is a
/// base-entity property (audit and tenant fields the gateway stamps itself) outside a short allowed
/// list. Insert also lets the caller supply the item id; update never lets it change.
/// </summary>
public static class WritableFields
{
    private static readonly string[] InsertAllowedBaseFields =
    [
        nameof(GraphQlBaseEntity.OrganizationId),
        nameof(GraphQlBaseEntity.Tags),
        nameof(GraphQlBaseEntity.Language),
        nameof(GraphQlBaseEntity.ItemId)
    ];

    private static readonly string[] UpdateAllowedBaseFields =
    [
        nameof(GraphQlBaseEntity.OrganizationId),
        nameof(GraphQlBaseEntity.Tags),
        nameof(GraphQlBaseEntity.Language)
    ];

    public static bool IsWritable(string fieldName, WriteOperation operation)
    {
        var allowed = operation == WriteOperation.Insert ? InsertAllowedBaseFields : UpdateAllowedBaseFields;

        return allowed.Contains(fieldName)
            || typeof(GraphQlBaseEntity).GetProperty(fieldName) is null;
    }
}
