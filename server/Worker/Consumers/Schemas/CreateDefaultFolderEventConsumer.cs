using Blocks.Genesis;
using MongoDB.Driver;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Entities;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Storage;
namespace Worker.Consumers;

public class CreateDefaultFolderEventConsumer : IConsumer<CreateDefaultFolderEvent>
{
    private readonly ILogger<CreateDefaultFolderEventConsumer> _logger;
    private readonly IFileRepository _fileRepository;
    public CreateDefaultFolderEventConsumer(ILogger<CreateDefaultFolderEventConsumer> logger, IFileRepository fileRepository)
    {
        _logger = logger;
        _fileRepository = fileRepository;
    }
    public async Task Consume(CreateDefaultFolderEvent @event)
    {
        _logger.LogInformation("Consuming create default folder event for item id: {@ItemId}", @event.ItemId);
        try
        {
            var filter = Builders<DmsArtifact>.Filter.Eq(u => u.ArtifactType, (int)DmsArtifactType.Folder);
            filter &= Builders<DmsArtifact>.Filter.Eq(u => u.ConfigurationName, "Azure");
            var defaultFolders = await _fileRepository.GetDmsArtifactsAsync(filter);
            PrepareDefaultFolders(defaultFolders, @event.StorageStrategy, string.Empty);
            await _fileRepository.SavedmsArtifactsAsync(defaultFolders);
            _logger.LogInformation("Create default folder event for item id: {@ItemId} consumed successfully", @event.ItemId);
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Error consuming create default folder event for item id: {@ItemId}", @event.ItemId);
        }
    }
    private void PrepareDefaultFolders(List<DmsArtifact> defaultFolders, string storageStrategy, string oldParentId, string newParentId = "")
    {
        _logger.LogInformation("Preparing default folders for parent id: {@ParentId}", oldParentId);
        var folders = defaultFolders.Where(x => x.ParentId == oldParentId).ToList();
        foreach (var folder in folders)
        {
            _logger.LogInformation("Preparing default folder for folderName: {@FolderName} item id: {@ItemId}", folder.Name, folder.ItemId);
            var newItemId = Guid.NewGuid().ToString();
            PrepareDefaultFolders(defaultFolders, storageStrategy, folder.ItemId, newItemId);
            folder.ItemId = newItemId;
            folder.CreatedBy = BlocksContext.GetContext()?.UserId ?? string.Empty;
            folder.LastUpdatedBy = BlocksContext.GetContext()?.UserId ?? string.Empty;
            folder.LastUpdatedDate = DateTime.UtcNow;
            folder.ParentId = newParentId;
            folder.ConfigurationName = storageStrategy;
        }
    }
}
