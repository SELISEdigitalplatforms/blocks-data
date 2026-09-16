using Storage.DomainService.Enums;

namespace Storage.DomainService.Utilities
{
    /// <summary>
    /// Builds the storage keys defined by the Phase 1 storage security plan: the legacy-compatible
    /// final key, the access-scoped quarantine key, and a unique server-owned verification-candidate
    /// key. Every component is sanitized so a caller-supplied file name cannot introduce an extra path
    /// segment. Which physical container/bucket a key actually lands in is decided by the provider
    /// (<see cref="DomainService.Storage.IStorageService.GenerateQuarantineUploadUrl"/> and
    /// <see cref="DomainService.Storage.IStorageService.PromoteCandidateToFinalAsync"/> route quarantine
    /// and final keys to the private and primary targets respectively); this builder only produces the
    /// logical key string recorded on the version.
    /// </summary>
    public static class StorageKeyBuilder
    {
        /// <summary>Legacy-compatible key for a completion-disabled upload: <c>Public|Private/{fileId}/{fileVersionId}/{fileName}</c>.</summary>
        public static string BuildFinalKey(AccessModifier accessModifier, string fileId, string fileVersionId, string fileName) =>
            $"{AccessSegment(accessModifier)}/{Segment(fileId)}/{Segment(fileVersionId)}/{Segment(fileName)}";

        /// <summary>Quarantine key for a completion-required upload: <c>Public|Private/Quarantine/{fileId}/{fileVersionId}/{fileName}</c>.</summary>
        public static string BuildQuarantineKey(AccessModifier accessModifier, string fileId, string fileVersionId, string fileName) =>
            $"{AccessSegment(accessModifier)}/Quarantine/{Segment(fileId)}/{Segment(fileVersionId)}/{Segment(fileName)}";

        /// <summary>
        /// Unique, server-owned candidate key for a completion attempt: <c>Verification/{uploadSessionId}/{randomId}/{fileName}</c>.
        /// A fresh random segment on every call means concurrent or retried completion attempts for the
        /// same version never collide on one candidate object.
        /// </summary>
        public static string BuildVerificationCandidateKey(string uploadSessionId, string fileName) =>
            $"Verification/{Segment(uploadSessionId)}/{Guid.NewGuid():N}/{Segment(fileName)}";

        private static string AccessSegment(AccessModifier accessModifier) =>
            accessModifier == AccessModifier.Public ? "Public" : "Private";

        private static string Segment(string value) => StorageKeySanitizer.SanitizeKeySegment(value);
    }
}
