using Blocks.Genesis;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace Worker.Consumers;

public class CreateDefaultDirectoryEventConsumer : IConsumer<CreateDefaultDirectoryEvent>
{
    private readonly ILogger<CreateDefaultDirectoryEventConsumer> _logger;
    private readonly IDirectoryRepository _directoryRepository;

    public CreateDefaultDirectoryEventConsumer(
        ILogger<CreateDefaultDirectoryEventConsumer> logger,
        IDirectoryRepository directoryRepository)
    {
        _logger = logger;
        _directoryRepository = directoryRepository;
    }

    public async Task Consume(CreateDefaultDirectoryEvent @event)
    {
        _logger.LogInformation("Consuming create default directory event for item id: {@ItemId}", @event.ItemId);
        try
        {
            // The default directory templates live in the Directorys collection (seeded with
            // ConfigurationName "Azure"). They are read-only templates; the cloned directorys
            // get fresh ids, rebuilt ancestry/full-path, and the target storage strategy.
            var templates = await _directoryRepository.GetByConfigurationNameAsync("Azure");

            var directories = BuildDirectories(templates, @event.StorageStrategy);
            if (directories.Count > 0)
            {
                await _directoryRepository.CreateDirectoriesAsync(directories);
            }

            _logger.LogInformation("Create default directory event for item id: {@ItemId} consumed successfully. {Count} directories created", @event.ItemId, directories.Count);
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Error consuming create default directory event for item id: {@ItemId}", @event.ItemId);
        }
    }

    /// <summary>
    /// Walks the template tree rooted at <c>ParentDirectoryID == null</c> and produces a flat
    /// list of cloned <see cref="FileDirectory"/> documents with fresh ids, cached ancestry and
    /// full paths, ready for bulk insert.
    /// </summary>
    private static List<FileDirectory> BuildDirectories(List<FileDirectory> templates, string storageStrategy)
    {
        var directories = new List<FileDirectory>();
        var context = BlocksContext.GetContext();
        var userId = context?.UserId ?? string.Empty;
        var tenantId = context?.TenantId ?? string.Empty;
        var now = DateTime.UtcNow;

        BuildChildren(
            templates, directories,
            templateParentId: null,
            newParentId: null,
            ancestorIds: new List<string>(),
            parentFullPath: null,
            storageStrategy, userId, tenantId, now);

        return directories;
    }

    /// <summary>
    /// Recursively clones the template directory tree. Children are matched by their template
    /// <c>ParentDirectoryID</c> against the parent's *template* <c>ItemId</c>, while each
    /// cloned <see cref="FileDirectory"/> carries a fresh GUID and points at the parent's *new*
    /// id. Root templates carry a null or empty parent id.
    /// </summary>
    private static void BuildChildren(
        List<FileDirectory> templates,
        List<FileDirectory> directories,
        string? templateParentId,
        string? newParentId,
        List<string> ancestorIds,
        string? parentFullPath,
        string storageStrategy,
        string userId,
        string tenantId,
        DateTime now)
    {
        var children = templates
            .Where(t => string.IsNullOrEmpty(templateParentId)
                ? string.IsNullOrEmpty(t.ParentId)
                : t.ParentId == templateParentId)
            .ToList();

        foreach (var template in children)
        {
            var newItemId = Guid.NewGuid().ToString();
            var fullPath = parentFullPath is null
                ? $"/{template.Name}"
                : $"{parentFullPath}/{template.Name}";

            directories.Add(new FileDirectory
            {
                ItemId = newItemId,
                Name = template.Name,
                SystemName = template.SystemName,
                ParentId = newParentId,
                Type = StructureType.Directory,
                TypeString = StructureType.Directory.ToString(),
                MetaData = template.MetaData ?? new Dictionary<string, MetaValue>(),
                AllowedFileExtensions = template.AllowedFileExtensions ?? Array.Empty<string>(),
                TenantId = tenantId,
                ConfigurationName = storageStrategy,
                ModuleName = template.ModuleName,
                Description = template.Description,
                AncestorIds = ancestorIds.ToList(),
                FullPath = fullPath,
                InheritsParentAccess = template.InheritsParentAccess,
                IsArchived = false,
                IsActive = true,
                ChildDirectoryCount = 0,
                ChildFileCount = 0,
                SizeInBytes = 0,
                CreatedBy = userId,
                CreatedDate = now,
                LastUpdatedBy = userId,
                LastUpdatedDate = now,
                Tags = template.Tags ?? new List<string>(),
            });

            var childAncestors = ancestorIds.Append(newItemId).ToList();
            BuildChildren(
                templates, directories,
                templateParentId: template.ItemId,
                newParentId: newItemId,
                ancestorIds: childAncestors,
                parentFullPath: fullPath,
                storageStrategy, userId, tenantId, now);
        }
    }
}
