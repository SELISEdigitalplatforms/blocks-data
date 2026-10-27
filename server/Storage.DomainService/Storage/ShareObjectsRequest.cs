using Blocks.Genesis.Entities.Data;

namespace DomainService.Storage.Dms
{
    /// <summary>Shares several resources with several principals at one permission. All or nothing.</summary>
    public class ShareObjectsRequest
    {
        public List<string> ResourceIds { get; set; } = new();
        public List<SharePrincipal> Principals { get; set; } = new();
        public ObjectPermission Permission { get; set; }
        public DateTime? ExpiresAt { get; set; }
    }

    /// <summary>One recipient of a bulk share.</summary>
    public class SharePrincipal
    {
        public ObjectPrincipalType PrincipalType { get; set; }
        public string? PrincipalId { get; set; }
        /// <summary>For Role principals, optionally limits the share to this organization.</summary>
        public string? OrganizationId { get; set; }
    }
}
