using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Utilities;

namespace Storage.DomainService.Services
{
    /// <summary>Decision made when routing one upload: which key it should land at first, and its resulting verification state.</summary>
    public class UploadKeyRoutingResult
    {
        public required string StorageKey { get; init; }
        public required bool UploadCompletionRequired { get; init; }
        public required FileVerificationStatus VerificationStatus { get; init; }
    }

    public interface IUploadKeyRouter
    {
        /// <summary>
        /// Resolves whether upload completion is required for <paramref name="accessModifier"/> under
        /// <paramref name="configuration"/>, and the storage key the upload should target as a result.
        /// </summary>
        UploadKeyRoutingResult ResolveUploadRouting(
            StorageConfiguration configuration, AccessModifier accessModifier, string fileId, string fileVersionId, string fileName);
    }

    /// <summary>
    /// Pure decision logic for Phase 1 key generation and target routing: completion disabled keeps the
    /// legacy final key and <see cref="FileVerificationStatus.Unverified"/>; completion required switches
    /// to the access-scoped quarantine key and <see cref="FileVerificationStatus.Quarantined"/>. Which
    /// physical container/bucket each key actually lands in is a provider concern, decided by
    /// <see cref="DomainService.Storage.IStorageService.GeneratePreSignedUploadUrlAsync"/> versus
    /// <see cref="DomainService.Storage.IStorageService.GenerateQuarantineUploadUrl"/> — this router only
    /// picks which of the two applies and what key to pass to it.
    /// </summary>
    public class UploadKeyRouter : IUploadKeyRouter
    {
        public UploadKeyRoutingResult ResolveUploadRouting(
            StorageConfiguration configuration, AccessModifier accessModifier, string fileId, string fileVersionId, string fileName)
        {
            if (configuration == null) throw new ArgumentNullException(nameof(configuration));

            if (!configuration.IsUploadCompletionRequiredFor(accessModifier))
            {
                return new UploadKeyRoutingResult
                {
                    StorageKey = StorageKeyBuilder.BuildFinalKey(accessModifier, fileId, fileVersionId, fileName),
                    UploadCompletionRequired = false,
                    VerificationStatus = FileVerificationStatus.Unverified
                };
            }

            return new UploadKeyRoutingResult
            {
                StorageKey = StorageKeyBuilder.BuildQuarantineKey(accessModifier, fileId, fileVersionId, fileName),
                UploadCompletionRequired = true,
                VerificationStatus = FileVerificationStatus.Quarantined
            };
        }
    }
}
