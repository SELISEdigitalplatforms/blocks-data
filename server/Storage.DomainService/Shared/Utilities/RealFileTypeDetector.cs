namespace Storage.DomainService.Utilities
{
    /// <summary>
    /// Lightweight magic-number check that a file's declared extension is plausible given its actual
    /// leading bytes. Phase 1 uses this only to catch an obviously mislabeled upload (e.g. an executable
    /// renamed to ".pdf"); it intentionally covers a small, common set of formats and lets anything else
    /// through unchallenged. A comprehensive, strict allowlist is Phase 3 scope.
    /// </summary>
    public static class RealFileTypeDetector
    {
        private static readonly Dictionary<string, byte[][]> SignaturesByExtension = new(StringComparer.OrdinalIgnoreCase)
        {
            [".pdf"] = new[] { new byte[] { 0x25, 0x50, 0x44, 0x46 } }, // %PDF
            [".png"] = new[] { new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A } },
            [".jpg"] = new[] { new byte[] { 0xFF, 0xD8, 0xFF } },
            [".jpeg"] = new[] { new byte[] { 0xFF, 0xD8, 0xFF } },
            [".gif"] = new[] { new byte[] { 0x47, 0x49, 0x46, 0x38, 0x37, 0x61 }, new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61 } }, // GIF87a / GIF89a
            // Every Office Open XML and plain ZIP format shares the ZIP local-file-header signature.
            [".zip"] = new[] { new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            [".docx"] = new[] { new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            [".xlsx"] = new[] { new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            [".pptx"] = new[] { new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
        };

        /// <summary>
        /// True when <paramref name="extension"/> is not one of the formats this detector recognizes, or
        /// when its recognized signature is present at the start of <paramref name="initialBytes"/>. A
        /// caller-declared extension we do not recognize is not itself grounds for rejection in Phase 1.
        /// </summary>
        public static bool MatchesDeclaredExtension(string? extension, byte[] initialBytes)
        {
            if (string.IsNullOrEmpty(extension) || !SignaturesByExtension.TryGetValue(extension, out var signatures))
                return true;

            foreach (var signature in signatures)
            {
                if (initialBytes.Length >= signature.Length && initialBytes.AsSpan(0, signature.Length).SequenceEqual(signature))
                    return true;
            }

            return false;
        }
    }
}
