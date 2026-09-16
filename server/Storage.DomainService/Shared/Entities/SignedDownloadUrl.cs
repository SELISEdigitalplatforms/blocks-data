namespace Storage.DomainService.Entities
{
    /// <summary>
    /// A provider-generated download URL together with when it stops working. The provider itself is
    /// the only place that knows whether it returned a signed URL (which really does expire) or an
    /// intentionally anonymous public URL (which has no meaningful expiry) - a caller must not guess.
    /// </summary>
    public class SignedDownloadUrl
    {
        public required string Url { get; init; }

        /// <summary>UTC instant this URL stops working. Null only for an intentionally anonymous, non-expiring URL.</summary>
        public DateTime? ExpiresAtUtc { get; init; }
    }
}
