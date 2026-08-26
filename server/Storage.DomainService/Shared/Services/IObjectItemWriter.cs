using Storage.DomainService.Entities;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public interface IObjectItemWriter
    {
        Task UpsertAsync(File file, CancellationToken cancellationToken = default);
        Task UpsertAsync(FileDirectory directory, CancellationToken cancellationToken = default);
        Task DeleteAsync(string objectReferenceId, CancellationToken cancellationToken = default);
        Task SetInheritanceAsync(string objectReferenceId, bool inherits, CancellationToken cancellationToken = default);
        Task SetArchiveByDirectoryIdsAsync(IReadOnlyCollection<string> directoryIds, bool isArchived, CancellationToken cancellationToken = default);
    }
}
