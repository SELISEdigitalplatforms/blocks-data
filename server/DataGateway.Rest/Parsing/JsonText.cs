using System.Text.Json;

namespace DataGateway.Rest.Parsing;

/// <summary>
/// Reads JSON strings and property names that may hold invalid UTF-16 (a lone surrogate written as an escape such as
/// <c>\ud800</c>): <see cref="JsonElement"/> parses such text but throws when it is read as a string, which would
/// surface as a 500. Here it becomes a 400 field error.
/// </summary>
internal static class JsonText
{
    /// <summary>The path a bad property name at the top level is reported under.</summary>
    public const string Root = "(root)";

    /// <summary>The string value of <paramref name="value"/> (which must be a JSON string), reported under <paramref name="path"/> when invalid.</summary>
    public static string String(JsonElement value, string path)
    {
        try
        {
            return value.GetString()!;
        }
        catch (InvalidOperationException)
        {
            throw Invalid(path);
        }
    }

    /// <summary>The name of <paramref name="property"/>; an invalid one is reported under its parent's path (<see cref="Root"/> at the top level).</summary>
    public static string Name(JsonProperty property, string parentPath)
    {
        try
        {
            return property.Name;
        }
        catch (InvalidOperationException)
        {
            throw Invalid(parentPath.Length == 0 ? Root : parentPath);
        }
    }

    private static RestRequestException Invalid(string path)
        => RestRequestException.ForField(path, $"Field '{path}' contains an invalid string.", FieldPaths.InvalidValueType);
}
