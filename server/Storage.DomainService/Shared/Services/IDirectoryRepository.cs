using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services
{
    public interface IDirectoryRepository
    {
        Task CreateDirectoryAsync(Directory directory);
        Task<List<Directory>> GetDirectories(string directoryId);
        Task<Directory> GetDirectoryByItemIDAsync(string itemID);
        Task UpdateDirectory(Directory directory);
    }
}
