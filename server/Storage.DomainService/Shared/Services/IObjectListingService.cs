using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public interface IObjectListingService
    {
        Task<VisibleChildrenPage> GetVisibleChildrenAsync(string parentId, string? cursor = null, int limit = 50,
            StructureType? type = null, string? search = null, CancellationToken cancellationToken = default);
    }
}
