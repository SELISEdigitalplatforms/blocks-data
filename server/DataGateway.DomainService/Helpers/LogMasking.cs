namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Masks personal data before it is written to a log. A masked value is enough to recognise whose
/// action a log line describes while investigating an issue, without the log holding the full
/// value (GDPR data minimisation).
/// </summary>
public static class LogMasking
{
    // Always the same number of stars, so a masked value does not reveal the original length.
    private const string Stars = "*******";

    /// <summary>
    /// Keeps the start of the address before the @ and the whole domain:
    /// "johne.doe@gmail.com" becomes "joh*******@gmail.com".
    /// </summary>
    public static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return string.Empty;
        }

        email = email.Trim();
        var at = email.LastIndexOf('@');
        if (at <= 0 || at == email.Length - 1)
        {
            // Not an address; mask it as plain text rather than risk writing it in full.
            return MaskText(email);
        }

        return MaskText(email[..at]) + email[at..];
    }

    /// <summary>
    /// Keeps the first three characters of a value of six or more ("Kazi Lakit" becomes
    /// "Kaz*******"), the first character of a shorter one, and nothing of a single character.
    /// </summary>
    public static string MaskText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        value = value.Trim();
        var visible = value.Length >= 6 ? 3 : value.Length >= 2 ? 1 : 0;
        return value[..visible] + Stars;
    }
}
