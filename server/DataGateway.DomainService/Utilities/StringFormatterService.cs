namespace DataGateway.DomainService.Utilities;

public static class StringFormatterService
{
    public static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
            return value;

        var truncated = value.Length <= maxLength ? value : value[..maxLength];
        return truncated.TrimEnd('-');
    }
}
