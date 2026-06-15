namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Parses PocketBase-style sort strings (e.g. "-created,name,+price") into the
/// list-of-dictionaries shape that OrderToMongoSortConverter.Convert already accepts.
/// </summary>
public static class SortStringParser
{
    public static List<Dictionary<string, object?>> Parse(string sortString)
    {
        var result = new List<Dictionary<string, object?>>();
        if (string.IsNullOrWhiteSpace(sortString))
            return result;

        var parts = sortString.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var part in parts)
        {
            string field;
            string direction;

            if (part.StartsWith('-'))
            {
                field = part[1..];
                direction = "DESC";
            }
            else if (part.StartsWith('+'))
            {
                field = part[1..];
                direction = "ASC";
            }
            else
            {
                field = part;
                direction = "ASC";
            }

            if (string.IsNullOrWhiteSpace(field))
                continue;

            result.Add(new Dictionary<string, object?>
            {
                ["field"] = field,
                ["direction"] = direction
            });
        }

        return result;
    }
}
