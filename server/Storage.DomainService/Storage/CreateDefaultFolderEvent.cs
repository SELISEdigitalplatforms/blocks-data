using Blocks.Genesis;

namespace Storage.DomainService.Storage;

public class CreateDefaultFolderEvent
{
    public string ItemId { get; set; }
    public string ConfigurationName { get; set; }
    public string StorageStrategy { get; set; }
    public string ProjectKey { get; set; }
}
