using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// The checks the query string and the body share, so both forms of a list request accept the same values and fail
/// with the same messages.
/// </summary>
internal static class ListQueryRules
{
    /// <summary>
    /// Builds the order list from <c>(field, direction)</c> entries. Each field must be a top-level scalar field of the
    /// entity (not a DTO), at most once. Direction is <c>ASC</c> or <c>DESC</c> in any case, ascending when missing. Null when
    /// there are no entries.
    /// </summary>
    public static IReadOnlyList<OrderItem>? Order(EntityModel entity, IEnumerable<(string Field, string? Direction)> entries)
    {
        var items = new List<OrderItem>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (rawField, rawDirection) in entries)
        {
            var field = FieldPaths.RequireTopLevel(entity, rawField.Trim());
            // A sort on a whole DTO orders by the fields inside it, which the column rules check one by one.
            if (!SchemaTypeHelper.IsScalar(FieldPaths.Find(entity.Schema.Fields, field)!.Type))
                throw RestRequestException.ForField(
                    field, $"Field '{field}' cannot be used to sort; sort by one of its fields instead.", FieldPaths.InvalidValueType);
            if (!seen.Add(field))
                throw RestRequestException.ForField(field, $"Field '{field}' appears more than once in 'order'.", FieldPaths.InvalidValueType);
            items.Add(new OrderItem(field, Direction(field, rawDirection)));
        }
        return items.Count == 0 ? null : items;
    }

    private static SortDirection Direction(string field, string? raw)
    {
        var direction = raw?.Trim();
        if (string.IsNullOrEmpty(direction) || direction.Equals("ASC", StringComparison.OrdinalIgnoreCase))
            return SortDirection.ASC;
        if (direction.Equals("DESC", StringComparison.OrdinalIgnoreCase))
            return SortDirection.DESC;
        throw RestRequestException.ForField(
            field, $"Invalid sort direction '{direction}' for field '{field}'. Use ASC or DESC.", FieldPaths.InvalidValueType);
    }

    /// <summary>
    /// Checks the select paths: each must exist on the entity or its DTOs. Repeats are dropped; no paths means
    /// every field the caller may read.
    /// </summary>
    public static IReadOnlyList<string> Select(EntityModel entity, IEnumerable<string> paths)
    {
        var result = new List<string>();
        foreach (var raw in paths)
        {
            var path = raw.Trim();
            if (path.Length == 0)
                throw new RestRequestException("'select' contains an empty field path.");
            FieldPaths.RequirePath(entity, path);
            if (!result.Contains(path, StringComparer.Ordinal))
                result.Add(path);
        }
        return result;
    }

    /// <summary><c>pageNo</c> is 1 or more and <c>pageSize</c> 1 to <see cref="RestLimits.MaxPageSize"/>; anything else is refused, never clamped.</summary>
    public static void CheckPaging(int pageNo, int pageSize, RestLimits limits)
    {
        if (pageNo < 1)
            throw new RestRequestException("'pageNo' must be 1 or greater.");
        if (pageSize < 1 || pageSize > limits.MaxPageSize)
            throw new RestRequestException($"'pageSize' must be between 1 and {limits.MaxPageSize}.");
    }

    public static RestRequestException NotAWholeNumber(string name) => new($"'{name}' must be a whole number.");

    public static RestRequestException NotABoolean(string name) => new($"'{name}' must be true or false.");
}
