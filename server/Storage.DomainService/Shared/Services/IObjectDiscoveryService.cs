using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public interface IObjectDiscoveryService
    {
        Task<VisibleChildrenPage> SearchAsync(string query, string? directoryId = null, StructureType? type = null, string? cursor = null, int limit = 50, CancellationToken cancellationToken = default);
        Task<VisibleChildrenPage> GetObjectAsync(string? parentDirectoryId, StructureType? type = null, string? search = null, string? cursor = null, int limit = 50, CancellationToken cancellationToken = default);
        Task<VisibleChildrenPage> GetTrashAsync(StructureType? type = null, string? cursor = null, int limit = 50, CancellationToken cancellationToken = default);
        Task<VisibleChildrenPage> GetSharedAsync(StructureType? type = null, string? cursor = null, int limit = 50, CancellationToken cancellationToken = default);
        Task<TrashOperationResult> RestoreAsync(string resourceId, CancellationToken cancellationToken = default);
        Task<TrashOperationResult> DeleteFromTrashAsync(string resourceId, CancellationToken cancellationToken = default);
    }
}
