using Storage.DomainService.Entities;
using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public interface IFileVersionRepository
    {
        Task DeleteFileVersionsAsync(string fileId);
        Task CreateFileVersionAsync(FileVersion fileVersion);
        IEnumerable<string> GetFileVersionIds(string fileId);
        IEnumerable<FileVersion> GetFileVersions(string fileId);
        Task<long> GetLatestFileVersionNumberAsync(string fileId);

        /// <summary>Loads the exact file/version pair, or null when the identifiers do not name one stored version.</summary>
        Task<FileVersion?> GetFileVersionAsync(string fileId, string fileVersionId);

        /// <summary>
        /// Atomically claims completion for a <see cref="Storage.DomainService.Enums.FileVerificationStatus.Quarantined"/>
        /// version whose prior claim, if any, has expired. Returns the claimed version, or null when the version does
        /// not exist, is not Quarantined, or is already claimed under an unexpired lease — so two concurrent
        /// completion calls cannot both start verification for the same version.
        /// </summary>
        Task<FileVersion?> TryClaimCompletionAsync(string fileId, string fileVersionId, TimeSpan leaseDuration);

        /// <summary>
        /// Records a completion outcome: sets the final <see cref="FileVerificationStatus"/> (and, on a
        /// successful promotion, the version's final <see cref="FileVersion.StorageKey"/>), releases the
        /// completion claim, and stamps a rejection reason when there is one. Returns true when a matching
        /// document was updated.
        /// </summary>
        Task<bool> CompleteVerificationAsync(
            string fileId, string fileVersionId, FileVerificationStatus finalStatus, string? finalStorageKey, string? rejectionReason);
    }
}
