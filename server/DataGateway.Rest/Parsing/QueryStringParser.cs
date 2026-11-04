using System.Globalization;
using DataGateway.DomainService.Gateway;
using Microsoft.AspNetCore.Http;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Reads a list request's query string (<c>GET /api/gateway/{entity}</c>):
/// <c>order=name:ASC,createdDate:DESC</c>, <c>select=name,address.city</c>, <c>pageNo</c>, <c>pageSize</c> and
/// <c>includeTotalCount</c>. Strict: an unknown parameter (names are case-sensitive) or one given twice is refused,
/// so a typo never silently widens or reshapes the result. There is no filter in the query string; a filtered list
/// is a <c>POST</c> with a <c>where</c> body.
/// </summary>
public static class QueryStringParser
{
    private const string PageNo = "pageNo";
    private const string PageSize = "pageSize";
    private const string SelectParameter = "select";
    private const string OrderParameter = "order";
    private const string IncludeTotalCount = "includeTotalCount";

    private static readonly string[] ListParameters = [PageNo, PageSize, SelectParameter, OrderParameter, IncludeTotalCount];
    private static readonly string[] SelectOnlyParameters = [SelectParameter];

    public static RestQueryOptions Parse(IQueryCollection query, EntityModel entity, RestLimits limits)
    {
        var values = Read(query, ListParameters);

        var order = ParseOrder(values.GetValueOrDefault(OrderParameter), entity);
        var pageNo = ParseInt(values, PageNo) ?? 1;
        var pageSize = ParseInt(values, PageSize) ?? limits.DefaultPageSize;
        ListQueryRules.CheckPaging(pageNo, pageSize, limits);
        var select = ParseSelect(values.GetValueOrDefault(SelectParameter), entity);
        var includeTotalCount = ParseBool(values, IncludeTotalCount) ?? false;

        return new RestQueryOptions(null, order, pageNo, pageSize, select, includeTotalCount);
    }

    /// <summary>
    /// Reads the query string of a single-record read (<c>GET .../{entity}/{itemId}</c>), which takes only
    /// <c>select</c>, with the same strictness as <see cref="Parse"/>.
    /// </summary>
    public static IReadOnlyList<string> ParseSelectOnly(IQueryCollection query, EntityModel entity)
        => ParseSelect(Read(query, SelectOnlyParameters).GetValueOrDefault(SelectParameter), entity);

    private static Dictionary<string, string> Read(IQueryCollection query, string[] allowed)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, value) in query)
        {
            if (!allowed.Contains(key, StringComparer.Ordinal))
                throw new RestRequestException($"Unknown parameter '{key}'.");
            if (value.Count > 1)
                throw new RestRequestException($"Parameter '{key}' was given more than once.");
            values[key] = value.ToString();
        }
        return values;
    }

    /// <summary>An empty or missing value means the parameter was not given.</summary>
    private static int? ParseInt(Dictionary<string, string> values, string name)
    {
        if (!values.TryGetValue(name, out var raw) || string.IsNullOrWhiteSpace(raw))
            return null;
        return int.TryParse(raw.Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw ListQueryRules.NotAWholeNumber(name);
    }

    private static bool? ParseBool(Dictionary<string, string> values, string name)
    {
        if (!values.TryGetValue(name, out var raw) || string.IsNullOrWhiteSpace(raw))
            return null;
        var text = raw.Trim();
        if (text.Equals("true", StringComparison.OrdinalIgnoreCase))
            return true;
        if (text.Equals("false", StringComparison.OrdinalIgnoreCase))
            return false;
        throw ListQueryRules.NotABoolean(name);
    }

    private static IReadOnlyList<OrderItem>? ParseOrder(string? raw, EntityModel entity)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var entries = new List<(string Field, string? Direction)>();
        foreach (var entry in raw.Split(','))
        {
            var parts = entry.Split(':');
            if (parts.Length > 2 || string.IsNullOrWhiteSpace(parts[0]))
                throw new RestRequestException($"Invalid order entry '{entry.Trim()}'. Use field or field:ASC|DESC, separated by commas.");
            entries.Add((parts[0], parts.Length == 2 ? parts[1] : null));
        }
        return ListQueryRules.Order(entity, entries);
    }

    private static IReadOnlyList<string> ParseSelect(string? raw, EntityModel entity)
        => string.IsNullOrWhiteSpace(raw) ? [] : ListQueryRules.Select(entity, raw.Split(','));
}
