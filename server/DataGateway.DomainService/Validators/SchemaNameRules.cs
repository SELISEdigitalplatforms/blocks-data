using System.Text.RegularExpressions;

namespace DataGateway.DomainService.Validators;

/// <summary>
/// The one rule a schema name must follow: 1 to 50 characters, starting with a letter or '_', then letters, digits
/// or '_'. Schema creation validates against it, and the REST API uses it to turn away a route entity name that no
/// schema can have, before looking the name up.
/// </summary>
public static class SchemaNameRules
{
    public const int MinLength = 1;
    public const int MaxLength = 50;

    internal static readonly Regex Pattern = new(
        @"^[A-Za-z_][A-Za-z0-9_]*$",
        RegexOptions.Compiled,
        TimeSpan.FromSeconds(1));

    public static bool IsValid(string? name) =>
        name is { Length: >= MinLength and <= MaxLength }
        // "$" also matches before a final line feed, which no schema name may carry.
        && name[^1] != '\n'
        && Pattern.IsMatch(name);
}
