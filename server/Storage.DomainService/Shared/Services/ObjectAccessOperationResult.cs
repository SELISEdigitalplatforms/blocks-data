namespace Storage.DomainService.Services
{
    public sealed class ObjectAccessOperationResult
    {
        public ObjectAccessOperationStatus Status { get; init; }
        public string? PolicyItemId { get; init; }
        public bool IsSuccess => Status == ObjectAccessOperationStatus.Succeeded;
        public static ObjectAccessOperationResult Failure(ObjectAccessOperationStatus status) => new() { Status = status };
        public static ObjectAccessOperationResult Success(string? policyItemId = null) => new() { Status = ObjectAccessOperationStatus.Succeeded, PolicyItemId = policyItemId };
    }
}
