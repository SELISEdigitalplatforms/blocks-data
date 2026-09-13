namespace DataGateway.DomainService.Services;

/// <summary>
/// How an analytics range is cut into buckets. Hourly is what an incident is read at, daily is the
/// everyday view, weekly is for trends — all three share one key/step definition so every series
/// (counts, latency, transfer) lands on exactly the same axis.
/// </summary>
public sealed class GraphLogBucketing
{
    public static readonly GraphLogBucketing Hourly = new("hourly", TimeSpan.FromHours(1));
    public static readonly GraphLogBucketing Daily = new("daily", TimeSpan.FromDays(1));
    public static readonly GraphLogBucketing Weekly = new("weekly", TimeSpan.FromDays(7));

    private GraphLogBucketing(string granularity, TimeSpan step)
    {
        Granularity = granularity;
        Step = step;
    }

    public string Granularity { get; }
    public TimeSpan Step { get; }

    public static GraphLogBucketing Parse(string? granularity) => granularity?.ToLowerInvariant() switch
    {
        "hourly" => Hourly,
        "weekly" => Weekly,
        _ => Daily,
    };

    /// <summary>The bucket a timestamp belongs to: its hour, its day, or the Monday of its week.</summary>
    public DateTime KeyOf(DateTime timestamp)
    {
        if (this == Hourly)
            return new DateTime(timestamp.Year, timestamp.Month, timestamp.Day, timestamp.Hour, 0, 0, timestamp.Kind);

        if (this == Weekly)
            return StartOfWeek(timestamp.Date);

        return timestamp.Date;
    }

    /// <summary>
    /// Every bucket across the range, so a series is continuous and evenly spaced even where no
    /// requests landed — a gap in the axis reads as missing data rather than as quiet.
    /// </summary>
    public IEnumerable<DateTime> Range(DateTime from, DateTime to)
    {
        var end = KeyOf(to);

        for (var cursor = KeyOf(from); cursor <= end; cursor = cursor.Add(Step))
            yield return cursor;
    }

    /// <summary>How far back to look when the caller gave no start date: 24 buckets' worth.</summary>
    public DateTime DefaultRangeStart(DateTime rangeEnd) =>
        this == Hourly
            ? KeyOf(rangeEnd).AddHours(-24)
            : KeyOf(rangeEnd).Add(-(this == Weekly ? Step * 8 : Step * 7));

    private static DateTime StartOfWeek(DateTime date)
    {
        var daysSinceMonday = ((int)date.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
        return date.AddDays(-daysSinceMonday);
    }
}
