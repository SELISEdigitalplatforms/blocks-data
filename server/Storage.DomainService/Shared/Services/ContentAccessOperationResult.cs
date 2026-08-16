namespace Storage.DomainService.Services
{
    public sealed class ContentAccessOperationResult
    {
        public ContentAccessOperationStatus Status { get; init; }
        public string? PolicyItemId { get; init; }
        public bool IsSuccess => Status == ContentAccessOperationStatus.Succeeded;
        public static ContentAccessOperationResult Failure(ContentAccessOperationStatus status) => new() { Status = status };
        public static ContentAccessOperationResult Success(string? policyItemId = null) => new() { Status = ContentAccessOperationStatus.Succeeded, PolicyItemId = policyItemId };
    }
}
