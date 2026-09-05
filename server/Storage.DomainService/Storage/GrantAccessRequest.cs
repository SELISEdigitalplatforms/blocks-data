using Storage.DomainService.Entities;

namespace DomainService.Storage.Dms
{
    public class GrantAccessRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public ObjectResourceType ResourceType { get; set; }
        public ObjectPrincipalType PrincipalType { get; set; }

        /// <summary>Required for every principal kind except Everyone.</summary>
        public string? PrincipalId { get; set; }

        /// <summary>For Role principals, optionally limits the entry to this organization.</summary>
        public string? OrganizationId { get; set; }

        public ObjectPermission Permission { get; set; }
        public ObjectEffect Effect { get; set; } = ObjectEffect.Allow;
        public int Priority { get; set; }
        public DateTime? ExpiresAt { get; set; }

        /// <summary>Set when updating an existing entry rather than creating one.</summary>
        public string? PolicyItemId { get; set; }
    }
}
