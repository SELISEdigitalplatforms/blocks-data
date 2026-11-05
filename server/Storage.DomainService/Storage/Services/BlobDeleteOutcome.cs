namespace DomainService.Storage
{
    /// <summary>How a provider answered one blob delete.</summary>
    public enum BlobDeleteStatus
    {
        /// <summary>The provider deleted the blob. S3 also answers this way for a key that does not exist.</summary>
        Deleted,

        /// <summary>The blob was already missing (Azure <c>false</c> or 404, S3 404).</summary>
        NotFound,

        /// <summary>The provider rejected this one key (400 or 409); the delete continues with the next key.</summary>
        Skipped,

        /// <summary>
        /// Anything else (401, 403, 5xx, network, timeout, cancellation, unknown). Never returned by
        /// <see cref="IStorageService.TryDeleteFileAsync"/>: the provider rethrows instead, so the file's
        /// database record is kept and the request fails.
        /// </summary>
        Fatal,
    }

    /// <summary>The outcome of one blob delete, with the provider's status and error code when it skipped the key.</summary>
    public readonly record struct BlobDeleteOutcome(BlobDeleteStatus Status, int StatusCode = 0, string? ErrorCode = null)
    {
        public static BlobDeleteOutcome Deleted => new(BlobDeleteStatus.Deleted);

        public static BlobDeleteOutcome NotFound => new(BlobDeleteStatus.NotFound);

        public static BlobDeleteOutcome Fatal => new(BlobDeleteStatus.Fatal);

        public static BlobDeleteOutcome Skipped(int statusCode, string? errorCode) => new(BlobDeleteStatus.Skipped, statusCode, errorCode);
    }
}
