using System.Text;

namespace Storage.DomainService.Utilities
{
    /// <summary>
    /// Sanitizes the caller-influenced components used to build a storage key or a tenant-scoped
    /// container/bucket name. A file's declared name is attacker-controlled input: it must never be
    /// able to introduce an extra path separator or a traversal sequence that moves an object outside
    /// its intended key prefix.
    /// </summary>
    public static class StorageKeySanitizer
    {
        private const char Replacement = '_';

        /// <summary>
        /// Sanitizes one path segment of a storage key (a file id, version id, or file name). Path
        /// separators and control characters are replaced rather than rejected, so a caller-supplied
        /// value can never split into more path segments than the key builder intended.
        /// </summary>
        public static string SanitizeKeySegment(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return Replacement.ToString();

            var builder = new StringBuilder(value.Length);
            foreach (var ch in value)
            {
                builder.Append(ch is '/' or '\\' || char.IsControl(ch) ? Replacement : ch);
            }

            var sanitized = builder.ToString().Trim();

            // A segment that is only dots (".", "..", "...") reads as a traversal sequence to any
            // layer that later treats the key as a filesystem path; collapse it instead of allowing it.
            if (sanitized.Length == 0 || IsOnlyDots(sanitized))
                return Replacement.ToString();

            return sanitized;
        }

        /// <summary>
        /// Sanitizes a tenant identifier for use as a container/bucket name segment: lowercase,
        /// alphanumeric and hyphen only, since Azure and AWS both restrict container/bucket names to
        /// that character set.
        /// </summary>
        public static string SanitizeTenantSegment(string? tenantId)
        {
            if (string.IsNullOrWhiteSpace(tenantId))
                return Replacement.ToString();

            var builder = new StringBuilder(tenantId.Length);
            foreach (var ch in tenantId.ToLowerInvariant())
            {
                builder.Append(char.IsLetterOrDigit(ch) || ch == '-' ? ch : Replacement);
            }

            var sanitized = builder.ToString().Trim('-');
            return sanitized.Length == 0 ? Replacement.ToString() : sanitized;
        }

        private static bool IsOnlyDots(string value)
        {
            foreach (var ch in value)
            {
                if (ch != '.')
                    return false;
            }
            return true;
        }
    }
}
