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

        /// <summary>
        /// Writes <paramref name="content"/> to <paramref name="key"/> in <paramref name="container"/> and returns the
        /// object's permanent public URL: readable without credentials and without an expiry. The container is named by
        /// the caller, not derived from the tenant, so several tenants can share one (the <c>certificates</c> container).
        /// Public read is set per provider: the container's access level on Azure, a bucket policy on that one bucket on
        /// S3. An existing object at the key is replaced. Providers without public read (SFTP) throw
        /// <see cref="NotSupportedException"/>.
        /// </summary>
        Task<string> UploadPublicObjectAsync(string container, string key, Stream content, string contentType);

        /// <summary>
        /// Opens a stream over the object at <paramref name="key"/> in <paramref name="container"/> with the service's own
        /// credentials, or returns null when there is no such object. Providers without named containers (SFTP) throw
        /// <see cref="NotSupportedException"/>.
        /// </summary>
        Task<Stream?> OpenReadAsync(string container, string key);

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
