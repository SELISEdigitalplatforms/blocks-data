using System;

namespace DataGateway.DomainService.Helpers;

public static class StringHelper
{
    public static bool IsNullOrWhiteSpaceOrDefault(this string? value)
    {
        return string.IsNullOrWhiteSpace(value)
        || value.Equals("default", StringComparison.CurrentCultureIgnoreCase);
    }
}
