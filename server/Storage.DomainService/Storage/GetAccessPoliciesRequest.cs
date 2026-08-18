namespace DomainService.Storage.Dms
{
    /// <summary>Reads the access entries on one resource.</summary>
    public class GetAccessPoliciesRequest
    {
        public string ResourceId { get; set; } = string.Empty;

        /// <summary>Includes entries inherited from ancestors alongside the resource's own.</summary>
        public bool IncludeInherited { get; set; } = true;
    }
}
