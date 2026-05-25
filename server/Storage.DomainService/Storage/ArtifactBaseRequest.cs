using Storage.DomainService.Shared.Dtos;

namespace Storage.DomainService.Storage
{
    public class ArtifactBaseRequest : AuthInfo
    {
        public string? ItemId { get; set; }
        public string ArtifactName { get; set; }
        public string? ConfigurationName { get; set; }
        public string? Description { get; set; }
        public string? ParentId { get; set; }
        public string? DmsWorkspaceId { get; set; }
        public string? DmsWorkspaceName { get; set; }
        public List<string> Tags { get; set; }
        public IDictionary<string, MetaValuePair> MetaData { get; set; }
        public string? OrganizationId { get; set; }
    }

    public class MetaValuePair
    {
        public string Type { get; set; }
        public string Value { get; set; }
    }
}
