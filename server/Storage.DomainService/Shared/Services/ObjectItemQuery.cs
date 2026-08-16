using Storage.DomainService.Enums;

namespace Storage.DomainService.Services
{
    public sealed class ObjectItemQuery
    {
        public string? ParentDirectoryId { get; init; }
        public bool FilterByParent { get; init; }
        public string? DirectoryId { get; init; }
        public StructureType? Type { get; init; }
        public bool? IsArchived { get; init; }
        public string? Search { get; init; }
        public ContentCursor? Cursor { get; init; }
        public int Take { get; init; }
    }
}
