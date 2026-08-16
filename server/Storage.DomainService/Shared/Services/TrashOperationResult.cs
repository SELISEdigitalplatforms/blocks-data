namespace Storage.DomainService.Services
{
    public sealed class TrashOperationResult
    {
        public TrashOperationStatus Status { get; init; }
        public bool IsSuccess => Status == TrashOperationStatus.Succeeded;
        public static TrashOperationResult Failure(TrashOperationStatus status) => new() { Status = status };
        public static TrashOperationResult Success() => new() { Status = TrashOperationStatus.Succeeded };
    }
}
