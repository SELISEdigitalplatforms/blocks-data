using Storage.DomainService.Entities;

namespace DomainService.Storage.Dms
{
    /// <summary>Grants a principal an allow entry and records it as a share.</summary>
    public class ShareObjectRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ObjectResourceType ResourceType { get; set; }
        public ObjectPrincipalType PrincipalType { get; set; }
        public string? PrincipalId { get; set; }
        public ObjectPermission Permission { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }
}
