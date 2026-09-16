using Blocks.Genesis;
using Storage.DomainService.Enums;

namespace DomainService.Storage
{
    /// <summary>
    /// Result of a completion attempt. See <see cref="CompleteUploadRequest"/> for context on why
    /// this contract is defined ahead of the endpoint/verification logic that will populate it.
    /// </summary>
    public class CompleteUploadResponse : BaseResponse
    {
        public string FileId { get; set; } = string.Empty;
        public string FileVersionId { get; set; } = string.Empty;

        /// <summary>Final verification status: <see cref="FileVerificationStatus.Verified"/> or <see cref="FileVerificationStatus.Rejected"/>.</summary>
        public FileVerificationStatus VerificationStatus { get; set; } = FileVerificationStatus.Unverified;

        /// <summary>Safe, non-sensitive explanation when <see cref="VerificationStatus"/> is <see cref="FileVerificationStatus.Rejected"/>.</summary>
        public string? RejectionReason { get; set; }
    }
}
