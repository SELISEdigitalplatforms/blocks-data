using Blocks.Genesis;

namespace Storage.DomainService.Storage
{
    public class GetDmsFileAndFolderRequest
    {
        public string? ParentId { get; set; }
        public string? ConfigurationName { get; set; } = null;
        public string? SearchKey { get; set; }
        public string? ModuleName { get; set; }
        public int? Skip { get; set; }
        public int? Take { get; set; }
    }
}
