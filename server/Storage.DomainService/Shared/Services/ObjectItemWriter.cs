using Storage.DomainService.Entities;
using File = Storage.DomainService.Entities.File;

namespace Storage.DomainService.Services
{
    public sealed class ObjectItemWriter : IObjectItemWriter
    {
        private readonly IObjectItemRepository _repository;
        public ObjectItemWriter(IObjectItemRepository repository) => _repository = repository;
        public Task UpsertAsync(File file, CancellationToken cancellationToken = default) => _repository.UpsertAsync(ObjectItem.From(file), cancellationToken);
        public Task UpsertAsync(FileDirectory directory, CancellationToken cancellationToken = default) => _repository.UpsertAsync(ObjectItem.From(directory), cancellationToken);
        public Task DeleteAsync(string objectReferenceId, CancellationToken cancellationToken = default) => _repository.DeleteAsync(objectReferenceId, cancellationToken);
        public Task SetInheritanceAsync(string objectReferenceId, bool inherits, CancellationToken cancellationToken = default) => _repository.SetInheritanceAsync(objectReferenceId, inherits, cancellationToken);
        public Task SetArchiveByDirectoryIdsAsync(IReadOnlyCollection<string> directoryIds, bool isArchived, CancellationToken cancellationToken = default) => _repository.SetArchiveByDirectoryIdsAsync(directoryIds, isArchived, cancellationToken);
    }
}
