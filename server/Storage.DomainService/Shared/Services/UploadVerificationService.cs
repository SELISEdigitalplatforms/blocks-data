using System.Security.Cryptography;
using DomainService.Storage;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Utilities;

namespace Storage.DomainService.Services
{
    /// <summary>Outcome of one synchronous verification attempt. <see cref="Status"/> is always <see cref="FileVerificationStatus.Verified"/> or <see cref="FileVerificationStatus.Rejected"/>.</summary>
    public class VerificationResult
    {
        public required FileVerificationStatus Status { get; init; }

        /// <summary>Safe, non-sensitive reason set when <see cref="Status"/> is <see cref="FileVerificationStatus.Rejected"/>.</summary>
        public string? RejectionReason { get; init; }

        /// <summary>The verification-candidate key, when one was created. Recorded so a Phase 3 cleanup job can find it even on rejection.</summary>
        public string? CandidateKey { get; init; }

        public bool IsVerified => Status == FileVerificationStatus.Verified;
    }

    public interface IUploadVerificationService
    {
        /// <summary>
        /// Runs the Phase 1 synchronous verification pipeline against <paramref name="version"/>'s
        /// quarantined object: copy to a server-owned candidate, validate size/type, sniff the real file
        /// type, and check the declared checksum when one was supplied. Callers own claiming completion
        /// beforehand and persisting/promoting the result afterward - this only computes the outcome.
        /// </summary>
        Task<VerificationResult> VerifyAsync(
            IStorageService storageService, StorageConfiguration configuration, FileVersion version, string uploadSessionId, string fileName);
    }

    public class UploadVerificationService : IUploadVerificationService
    {
        /// <summary>Enough leading bytes for every signature in <see cref="RealFileTypeDetector"/>.</summary>
        private const int InitialByteReadCount = 16;

        public async Task<VerificationResult> VerifyAsync(
            IStorageService storageService, StorageConfiguration configuration, FileVersion version, string uploadSessionId, string fileName)
        {
            if (storageService == null) throw new ArgumentNullException(nameof(storageService));
            if (configuration == null) throw new ArgumentNullException(nameof(configuration));
            if (version == null) throw new ArgumentNullException(nameof(version));

            if (string.IsNullOrEmpty(version.StorageKey))
                return Rejected("quarantine_key_missing");

            // Copying before any check runs means every subsequent read operates on a stable, server-owned
            // object; a change to the quarantine key after this point cannot alter what gets verified.
            var candidateKey = StorageKeyBuilder.BuildVerificationCandidateKey(uploadSessionId, fileName);
            var copiedKey = await storageService.CopyToVerificationCandidateAsync(version.StorageKey, candidateKey);

            if (copiedKey is null)
                return Rejected("quarantine_object_not_found");

            var metadata = await storageService.GetCandidateMetadataAsync(candidateKey);
            if (metadata is null)
                return Rejected("candidate_object_not_found", candidateKey);

            if (version.ExpectedSizeInBytes is { } expectedSize && metadata.SizeInBytes != expectedSize)
                return Rejected("actual_size_does_not_match_declared_size", candidateKey);

            if (metadata.SizeInBytes > configuration.GetMaxFileSizeInBytes())
                return Rejected("actual_size_exceeds_maximum_allowed", candidateKey);

            if (!string.IsNullOrEmpty(version.ExpectedContentType)
                && !string.IsNullOrEmpty(metadata.ContentType)
                && !string.Equals(version.ExpectedContentType, metadata.ContentType, StringComparison.OrdinalIgnoreCase))
                return Rejected("stored_content_type_does_not_match_declared_content_type", candidateKey);

            var initialBytes = await storageService.ReadCandidateInitialBytesAsync(candidateKey, InitialByteReadCount);
            if (!RealFileTypeDetector.MatchesDeclaredExtension(Path.GetExtension(fileName), initialBytes))
                return Rejected("real_file_type_does_not_match_extension", candidateKey);

            if (!string.IsNullOrEmpty(version.ExpectedChecksum))
            {
                var checksumRejectionReason = await VerifyChecksumAsync(storageService, candidateKey, version, metadata);
                if (checksumRejectionReason != null)
                    return Rejected(checksumRejectionReason, candidateKey);
            }

            return new VerificationResult { Status = FileVerificationStatus.Verified, CandidateKey = candidateKey };
        }

        /// <summary>
        /// Compares against a provider-exposed checksum when one is available and declared as MD5 - the
        /// common case, and cheap since it needs no extra read. Anything else streams the whole candidate
        /// to compute it directly; acceptable for Phase 1's synchronous flow, expensive for a large file,
        /// which is exactly why large-file async verification is Phase 3.
        /// </summary>
        private static async Task<string?> VerifyChecksumAsync(
            IStorageService storageService, string candidateKey, FileVersion version, StorageObjectMetadata metadata)
        {
            if (!string.IsNullOrEmpty(metadata.Checksum) && IsMd5(version.ChecksumAlgorithm))
            {
                return ChecksumsMatch(metadata.Checksum, version.ExpectedChecksum) ? null : "checksum_mismatch";
            }

            using var stream = await storageService.OpenCandidateReadStreamAsync(candidateKey);
            var computedChecksum = await ComputeChecksumAsync(stream, version.ChecksumAlgorithm);

            return ChecksumsMatch(computedChecksum, version.ExpectedChecksum) ? null : "checksum_mismatch";
        }

        private static bool IsMd5(string? algorithm) => string.Equals(algorithm, "MD5", StringComparison.OrdinalIgnoreCase);

        /// <summary>Checksums are compared as hex, case-insensitively; this is the format every provider-exposed checksum in this codebase is normalized to.</summary>
        private static bool ChecksumsMatch(string computed, string? expected) =>
            !string.IsNullOrEmpty(expected) && string.Equals(computed, expected, StringComparison.OrdinalIgnoreCase);

        private static async Task<string> ComputeChecksumAsync(Stream stream, string? algorithm)
        {
            using HashAlgorithm hasher = (algorithm ?? "SHA256").ToUpperInvariant() switch
            {
                "MD5" => MD5.Create(),
                "SHA1" => SHA1.Create(),
                _ => SHA256.Create()
            };

            var hash = await hasher.ComputeHashAsync(stream);
            return Convert.ToHexString(hash);
        }

        private static VerificationResult Rejected(string reason, string? candidateKey = null) => new()
        {
            Status = FileVerificationStatus.Rejected,
            RejectionReason = reason,
            CandidateKey = candidateKey
        };
    }
}
