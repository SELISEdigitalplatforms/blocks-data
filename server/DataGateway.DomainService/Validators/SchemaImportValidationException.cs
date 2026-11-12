namespace DataGateway.DomainService.Validators;

/// <summary>
/// An import file that fails validation. Nothing has been written when this is thrown.
/// <see cref="Errors"/> are the validator's messages, safe to show to the importing user;
/// the message keeps the "Import validation failed:" format used before this type existed.
/// </summary>
public sealed class SchemaImportValidationException : InvalidOperationException
{
    public IReadOnlyList<string> Errors { get; }

    public SchemaImportValidationException(IReadOnlyList<string> errors)
        : base($"Import validation failed:\n{string.Join("\n", errors)}")
    {
        Errors = errors;
    }
}
