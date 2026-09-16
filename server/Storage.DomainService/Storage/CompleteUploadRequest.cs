namespace DomainService.Storage
{
    /// <summary>
    /// Request to synchronously verify and promote a quarantined upload. Defined here (Phase 1
    /// contracts) so blocks-data, its Logic compatibility route, and the storage driver package
    /// share one shape; verification/promotion behavior itself lands in a later Phase 1 task.
    /// </summary>
    public class CompleteUploadRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string FileVersionId { get; set; } = string.Empty;
    }
}
