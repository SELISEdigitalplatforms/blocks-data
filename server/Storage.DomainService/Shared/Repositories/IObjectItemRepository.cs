using Storage.DomainService.Entities;

namespace Storage.DomainService.Services
{
    public interface IObjectItemRepository
    {
        Task<List<ObjectItem>> FindPageAsync(ObjectItemQuery query, CancellationToken cancellationToken = default);
        Task UpsertAsync(ObjectItem item, CancellationToken cancellationToken = default);
        Task DeleteAsync(string objectReferenceId, CancellationToken cancellationToken = default);
        Task SetInheritanceAsync(string objectReferenceId, bool inherits, CancellationToken cancellationToken = default);
        Task SetArchiveByDirectoryIdsAsync(IReadOnlyCollection<string> directoryIds, bool isArchived, CancellationToken cancellationToken = default);
    }
}
