using System.Globalization;
using System.Text.RegularExpressions;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// The one DateTime format the REST API accepts: ISO-8601 with a date, a time (seconds required, fraction
/// optional) and an explicit offset or <c>Z</c>, such as <c>2024-01-01T10:00:00Z</c> or
/// <c>2024-01-01T10:00:00.125+06:00</c>. A date alone, a time without an offset, or a locale format is refused:
/// each would be read in the server's own time zone or culture, so the same request would mean different instants
/// on different servers.
/// </summary>
public static partial class RestDateTime
{
    /// <summary>The instant as a UTC <see cref="DateTime"/> (<see cref="DateTimeKind.Utc"/>); false when not in the accepted format.</summary>
    public static bool TryParse(string s, out DateTime utc)
    {
        utc = default;
        if (string.IsNullOrEmpty(s) || !IsoWithOffset().IsMatch(s))
            return false;
        if (!DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var offset))
            return false;
        utc = offset.UtcDateTime;
        return true;
    }

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant)]
    private static partial Regex IsoWithOffset();
}
