using Storage.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace Storage.DomainService.Services
{
    /// <summary>The outcome of sharing several resources with several principals at once.</summary>
    public sealed class ObjectShareBatchResult
    {
        public ObjectAccessOperationStatus Status { get; init; }
        public bool IsSuccess => Status == ObjectAccessOperationStatus.Succeeded;

        /// <summary>The resources that caused a ResourceNotFound or NotPermitted failure. Empty otherwise.</summary>
        public IReadOnlyList<string> FailedResourceIds { get; init; } = Array.Empty<string>();

        /// <summary>The entries created, one per resource × principal. Empty on failure.</summary>
        public IReadOnlyList<ObjectAccessPolicy> Policies { get; init; } = Array.Empty<ObjectAccessPolicy>();

        /// <summary>Validation messages by property, when the request itself was rejected. Empty otherwise.</summary>
        public IReadOnlyDictionary<string, string> Errors { get; init; } = new Dictionary<string, string>();

        public static ObjectShareBatchResult Invalid(IReadOnlyDictionary<string, string> errors) =>
            new() { Status = ObjectAccessOperationStatus.InvalidRequest, Errors = errors };

        public static ObjectShareBatchResult Failure(ObjectAccessOperationStatus status, IReadOnlyList<string>? failedResourceIds = null) =>
            new() { Status = status, FailedResourceIds = failedResourceIds ?? Array.Empty<string>() };

        public static ObjectShareBatchResult Success(IReadOnlyList<ObjectAccessPolicy> policies) =>
            new() { Status = ObjectAccessOperationStatus.Succeeded, Policies = policies };
    }
}
