using Microsoft.AspNetCore.Http;
using Storage.DomainService.Entities;

namespace DomainService.Storage
{
    public interface IStorageService
    {
        Task<IEnumerable<string>> ListFilesAsync();
        Task<bool> DeleteFileAsync(string fileInfo);
        string GeneratePreSignedUploadUrlAsync(string fileName, TimeSpan expiry);
        Task<SignedDownloadUrl?> GetDownloadUrlAsync(DownloadUrlRequest request);
        Task<Stream?> DownloadFileAsync(string fileName, string? projectKey = null,  string? itemId = null, string? versionId = null);
        Task<bool> UploadFileToSftpAsync(string fileName, string projectKey, string itemId, string versionId, IFormFile file);

        #region Phase1UploadSecurity

        /// <summary>Headers the client must send with the provider upload request for a signed URL from this provider (e.g. Azure's required blob-type header). Empty when the provider needs none.</summary>
        Dictionary<string, string> GetRequiredUploadHeaders(string? contentType);

        /// <summary>
        /// Generates a presigned upload URL for <paramref name="key"/> inside this provider's private
        /// quarantine target, distinct from <see cref="GeneratePreSignedUploadUrlAsync"/>'s target so a
        /// completion-required upload has no anonymous provider path before verification.
        /// </summary>
        string GenerateQuarantineUploadUrl(string key, TimeSpan expiry);

        /// <summary>
        /// Copies the quarantined object at <paramref name="quarantineKey"/> to a new, server-owned
        /// <paramref name="candidateKey"/> inside the same private quarantine target, so later changes to
        /// the quarantine key cannot change the bytes being verified or promoted. Returns the candidate key,
        /// or null when no object exists at <paramref name="quarantineKey"/>.
        /// </summary>
        Task<string?> CopyToVerificationCandidateAsync(string quarantineKey, string candidateKey);

        /// <summary>Reads size/content-type/checksum metadata for a verification candidate without streaming its bytes.</summary>
        Task<StorageObjectMetadata?> GetCandidateMetadataAsync(string candidateKey);

        /// <summary>Reads the first <paramref name="byteCount"/> bytes of a verification candidate, for real-file-type detection.</summary>
        Task<byte[]> ReadCandidateInitialBytesAsync(string candidateKey, int byteCount);

        /// <summary>
        /// Opens a stream over the full verification candidate. Only used when the provider cannot expose
        /// a usable checksum through <see cref="GetCandidateMetadataAsync"/>, since streaming the whole
        /// object is the expensive path Phase 1 accepts for now; large-file async verification is Phase 3.
        /// </summary>
        Task<Stream> OpenCandidateReadStreamAsync(string candidateKey);

        /// <summary>
        /// Copies a verified candidate from the private quarantine target to <paramref name="finalKey"/> in
        /// this provider's primary target. The candidate and the quarantine object it came from are left in
        /// place; their deletion is deferred to Phase 3.
        /// </summary>
        Task PromoteCandidateToFinalAsync(string candidateKey, string finalKey);

        #endregion
    }
}
