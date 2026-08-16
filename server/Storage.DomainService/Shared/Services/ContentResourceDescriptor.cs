namespace Storage.DomainService.Services
{
    public sealed class ContentResourceDescriptor
    {
        public string ResourceId { get; set; } = string.Empty;
        public List<string> AncestorIds { get; set; } = new();
        public bool InheritsParentAccess { get; set; } = true;
        public string? CreatedBy { get; set; }
    }
}
