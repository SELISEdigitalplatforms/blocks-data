namespace DataGateway.DomainService.Helpers;

/// <summary>
/// A schema's description: plain text, at most <see cref="MaxLength"/> characters once trimmed. Empty is stored as no
/// description, so a schema without one stores and returns exactly what it did before descriptions existed.
/// </summary>
public static class SchemaDescription
{
    public const int MaxLength = 500;
    public const string LengthMessage = "Description_Length_Must_Be_At_Most_500_Characters.";

    public static bool HasValidLength(string? description) => (description?.Trim().Length ?? 0) <= MaxLength;

    /// <summary>The description as stored: trimmed, and null when empty.</summary>
    public static string? Normalize(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();
}
