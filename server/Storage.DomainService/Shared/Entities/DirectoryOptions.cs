namespace Storage.DomainService.Entities
{
    public class DirectoryOptions
    {
        public string Name { get; set; }
        public string ParentId { get; set; }
        public Dictionary<string, MetaValue> MetaData { get; set; }
        public string ItemId { get; set; }
        public string TenantId { get; set; }
        public DateTime CreateDate { get; set; }
        public string CreatedBy { get; set; }
        public List<string> Tags { get; set; }
        public string Language { get; set; }
        public string[] AllowedFileExtensions { get; set; }
        public List<string>? AncestorIds { get; set; }
        public string? FullPath { get; set; }
        public bool InheritsParentAccess { get; set; } = true;
        public string? ConfigurationName { get; set; }
        public string? ModuleName { get; set; }
        public string? Description { get; set; }
    }
}
