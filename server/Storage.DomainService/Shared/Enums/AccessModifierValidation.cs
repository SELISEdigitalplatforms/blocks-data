namespace Storage.DomainService.Enums
{
    /// <summary>
    /// Shared rules for which <see cref="AccessModifier"/> values are valid in a given Phase 1
    /// upload-security context, so Logic/OS configuration persistence and the storage domain agree.
    /// </summary>
    public static class AccessModifierValidation
    {
        /// <summary>The only access modifiers <c>UploadCompletionRequiredFor</c> may name.</summary>
        public static readonly IReadOnlyCollection<AccessModifier> AllowedUploadCompletionAccessModifiers =
            new[] { AccessModifier.Public, AccessModifier.Private };

        /// <summary>
        /// True when every entry in <paramref name="accessModifiers"/> is an allowed, non-duplicate
        /// upload-completion access modifier. A null/empty collection is valid (completion not required).
        /// </summary>
        public static bool IsValidUploadCompletionAccessModifierSet(IEnumerable<AccessModifier>? accessModifiers)
        {
            if (accessModifiers is null)
            {
                return true;
            }

            var seen = new HashSet<AccessModifier>();
            foreach (var accessModifier in accessModifiers)
            {
                if (!AllowedUploadCompletionAccessModifiers.Contains(accessModifier))
                {
                    return false;
                }

                if (!seen.Add(accessModifier))
                {
                    return false;
                }
            }

            return true;
        }
    }
}
