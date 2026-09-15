using Storage.DomainService.Enums;

namespace Storage.DomainService.Utilities
{
    /// <summary>
    /// The single readiness gate every content-returning read path must apply before consulting the
    /// existing View/Download access policy: a <see cref="FileVerificationStatus.Quarantined"/> or
    /// <see cref="FileVerificationStatus.Rejected"/> version can never produce bytes or a provider URL,
    /// no matter what the access policy would otherwise allow. A missing/null value (a legacy row) and
    /// <see cref="FileVerificationStatus.Unverified"/> are legacy-ready and fall through to that policy
    /// unchanged - this gate only ever adds a restriction, never a permission.
    /// </summary>
    public static class ReadReadinessPolicy
    {
        public static bool IsContentReadable(FileVerificationStatus? status) => status switch
        {
            FileVerificationStatus.Quarantined => false,
            FileVerificationStatus.Rejected => false,
            _ => true
        };
    }
}
