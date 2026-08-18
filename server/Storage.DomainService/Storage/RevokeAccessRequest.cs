namespace DomainService.Storage.Dms
{
    public class RevokeAccessRequest
    {
        public string ResourceId { get; set; } = string.Empty;
        public string PolicyItemId { get; set; } = string.Empty;
    }
}
